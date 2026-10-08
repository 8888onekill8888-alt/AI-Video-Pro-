import { randomUUID } from 'node:crypto';
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type { GenerationJob, JobType } from '@storyflix/shared';

export interface GenerationTask {
  id: string;
  projectId: string;
  ownerId: string;
  type: JobType;
  payload: Record<string, unknown>;
  createdAt: string;
  cancelRequested?: boolean;
}

export interface JobQueue {
  enqueue(input: Omit<GenerationTask, 'id' | 'createdAt'>): Promise<GenerationJob>;
  get(ownerId: string, id: string): Promise<GenerationJob | null>;
  list(ownerId: string, projectId?: string): Promise<GenerationJob[]>;
  cancel(ownerId: string, id: string): Promise<boolean>;
  retry(ownerId: string, id: string): Promise<GenerationJob | null>;
  close(): Promise<void>;
}

type JobExecutor = (task: GenerationTask, progress: (percent: number, message: string) => void) => Promise<unknown>;

function baseJob(task: GenerationTask): GenerationJob {
  return { id: task.id, projectId: task.projectId, type: task.type, status: 'QUEUED', progress: 0, message: 'Waiting for a worker', createdAt: task.createdAt, updatedAt: task.createdAt };
}

export class MemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, { task: GenerationTask; ownerId: string; job: GenerationJob }>();
  constructor(private readonly execute: JobExecutor = async () => ({ demo: true }), private readonly demoDelayMs = 280) {}

  async enqueue(input: Omit<GenerationTask, 'id' | 'createdAt'>): Promise<GenerationJob> {
    const task: GenerationTask = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    const entry = { task, ownerId: input.ownerId, job: baseJob(task) };
    this.jobs.set(task.id, entry);
    void this.process(entry);
    return structuredClone(entry.job);
  }

  async get(ownerId: string, id: string): Promise<GenerationJob | null> {
    const entry = this.jobs.get(id);
    return entry?.ownerId === ownerId ? structuredClone(entry.job) : null;
  }

  async list(ownerId: string, projectId?: string): Promise<GenerationJob[]> {
    return [...this.jobs.values()].filter((entry) => entry.ownerId === ownerId && (!projectId || entry.task.projectId === projectId)).map((entry) => structuredClone(entry.job)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async cancel(ownerId: string, id: string): Promise<boolean> {
    const entry = this.jobs.get(id);
    if (!entry || entry.ownerId !== ownerId || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(entry.job.status)) return false;
    entry.job.status = 'CANCELLED';
    entry.job.message = 'Cancelled by user';
    entry.job.updatedAt = new Date().toISOString();
    return true;
  }

  async retry(ownerId: string, id: string): Promise<GenerationJob | null> {
    const entry = this.jobs.get(id);
    if (!entry || entry.ownerId !== ownerId || !['FAILED', 'CANCELLED'].includes(entry.job.status)) return null;
    return this.enqueue({ projectId: entry.task.projectId, ownerId, type: entry.task.type, payload: entry.task.payload });
  }

  async close(): Promise<void> {}

  private async process(entry: { task: GenerationTask; ownerId: string; job: GenerationJob }): Promise<void> {
    const update = (percent: number, message: string) => {
      if (entry.job.status === 'CANCELLED') return;
      entry.job.status = 'PROCESSING';
      entry.job.progress = percent;
      entry.job.message = message;
      entry.job.updatedAt = new Date().toISOString();
    };
    try {
      update(8, 'Preparing creative assets');
      for (const [percent, message] of [[28, 'Building scene context'], [56, 'Generating your first pass'], [84, 'Finishing the result']] as const) {
        await new Promise((resolve) => setTimeout(resolve, this.demoDelayMs));
        if (entry.job.status === 'CANCELLED') return;
        update(percent, message);
      }
      const result = await this.execute(entry.task, update);
      if (entry.job.status === 'CANCELLED') return;
      entry.job.status = 'COMPLETED';
      entry.job.progress = 100;
      entry.job.message = 'Ready';
      entry.job.result = result;
    } catch (error) {
      if (entry.job.status === 'CANCELLED') return;
      entry.job.status = 'FAILED';
      entry.job.error = error instanceof Error ? error.message : 'Generation failed';
      entry.job.message = 'Generation failed';
    } finally {
      entry.job.updatedAt = new Date().toISOString();
    }
  }
}

const QUEUE_NAME = 'cineforge-generation';

export class RedisJobQueue implements JobQueue {
  private readonly queue: Queue<GenerationTask>;
  constructor(connectionUrl: string) {
    const url = new URL(connectionUrl);
    const connection: ConnectionOptions = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number(url.pathname.slice(1) || 0),
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    this.queue = new Queue<GenerationTask>(QUEUE_NAME, { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: 200, removeOnFail: 500 } });
  }

  async enqueue(input: Omit<GenerationTask, 'id' | 'createdAt'>): Promise<GenerationJob> {
    const task: GenerationTask = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.queue.add(task.type, task, { jobId: task.id } satisfies JobsOptions);
    return baseJob(task);
  }

  async get(ownerId: string, id: string): Promise<GenerationJob | null> {
    const job = await this.queue.getJob(id);
    if (!job || job.data.ownerId !== ownerId) return null;
    return this.toGenerationJob(job, await job.getState());
  }

  async list(ownerId: string, projectId?: string): Promise<GenerationJob[]> {
    const jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'], 0, 99, true);
    const visible = jobs.filter((job) => job.data.ownerId === ownerId && (!projectId || job.data.projectId === projectId));
    return Promise.all(visible.map(async (job) => this.toGenerationJob(job, await job.getState())));
  }

  async cancel(ownerId: string, id: string): Promise<boolean> {
    const job = await this.queue.getJob(id);
    if (!job || job.data.ownerId !== ownerId) return false;
    const state = await job.getState();
    if (['completed', 'failed'].includes(state)) return false;
    if (['waiting', 'delayed', 'paused'].includes(state)) await job.remove();
    else await job.updateData({ ...job.data, cancelRequested: true });
    return true;
  }

  async retry(ownerId: string, id: string): Promise<GenerationJob | null> {
    const job = await this.queue.getJob(id);
    if (!job || job.data.ownerId !== ownerId || !['failed', 'completed'].includes(await job.getState())) return null;
    return this.enqueue({ projectId: job.data.projectId, ownerId, type: job.data.type, payload: job.data.payload });
  }

  async close(): Promise<void> { await this.queue.close(); }

  private toGenerationJob(job: NonNullable<Awaited<ReturnType<Queue<GenerationTask>['getJob']>>>, state: string): GenerationJob {
    const progress = typeof job.progress === 'object' && job.progress !== null ? job.progress as { percent?: number; message?: string } : { percent: Number(job.progress) };
    const status = job.data.cancelRequested ? 'CANCELLED' : state === 'active' ? 'PROCESSING' : state === 'completed' ? 'COMPLETED' : state === 'failed' ? 'FAILED' : 'QUEUED';
    const failure = job.failedReason;
    return { id: job.id ?? job.data.id, projectId: job.data.projectId, type: job.data.type, status, progress: progress.percent ?? 0, message: progress.message ?? state, result: job.returnvalue, error: failure || undefined, createdAt: new Date(job.timestamp).toISOString(), updatedAt: new Date(job.processedOn ?? job.timestamp).toISOString() };
  }
}

export function createJobQueue(env: Record<string, string | undefined>, execute?: JobExecutor): JobQueue {
  return env.REDIS_URL ? new RedisJobQueue(env.REDIS_URL) : new MemoryJobQueue(execute, Number(env.DEMO_JOB_STEP_MS ?? 280));
}