package com.aivideostudio

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.util.Linkify
import android.text.method.LinkMovementMethod
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import com.bumptech.glide.Glide
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import kotlin.random.Random

class MainActivity : ComponentActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var selectedVideo: Uri? = null
    private var apiBaseUrl = BuildConfig.API_BASE_URL.ifBlank { "http://10.0.2.2:3000" }.trimEnd('/')
    private var subtitleShadow = true
    private val waveFrames = listOf("▁ ▃ ▅ ▂ ▇ ▄ ▁ ▆ ▃ ▅ ▂ ▇ ▄", "▃ ▆ ▂ ▅ ▃ ▇ ▂ ▄ ▆ ▁ ▅ ▃ ▇", "▅ ▂ ▇ ▄ ▃ ▆ ▁ ▅ ▂ ▇ ▄ ▃ ▆")
    private val visualizerPulse = object : Runnable {
        override fun run() {
            val bars = List(15) { waveFrames[Random.nextInt(waveFrames.size)].split(" ")[it % 13] }
            findViewById<TextView>(R.id.audioVisualizer).text = bars.joinToString(" ")
            mainHandler.postDelayed(this, 360)
        }
    }

    private val videoPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            selectedVideo = uri
            findViewById<TextView>(R.id.selectedVideoLabel).text =
                contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else uri.lastPathSegment
                } ?: uri.lastPathSegment
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        enableLinks(R.id.generationResult)
        enableLinks(R.id.translationResult)
        setupSpinners()
        setupControls()
        discoverService()
    }

    override fun onResume() {
        super.onResume()
        mainHandler.post(visualizerPulse)
    }

    override fun onPause() {
        mainHandler.removeCallbacks(visualizerPulse)
        super.onPause()
    }

    private fun setupSpinners() {
        setSpinner(R.id.categorySpinner, listOf("Action", "Horror", "Romance"))
        setSpinner(R.id.styleSpinner, listOf("Cinematic", "Anime", "3D"))
        setSpinner(R.id.moodSpinner, listOf("Dramatic", "Dark", "Warm"))
        setSpinner(
            R.id.languageSpinner,
            listOf("🇻🇳 Tiếng Việt", "🇺🇸 English", "🇪🇸 Español", "🇫🇷 Français", "🇯🇵 日本語", "🇰🇷 한국어")
        )
        setSpinner(R.id.aspectSpinner, listOf("16:9", "9:16", "1:1"))
    }

    private fun setSpinner(id: Int, items: List<String>) {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, items)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        findViewById<Spinner>(id).adapter = adapter
    }

    private fun enableLinks(id: Int) {
        findViewById<TextView>(id).apply {
            autoLinkMask = Linkify.WEB_URLS
            linksClickable = true
            movementMethod = LinkMovementMethod.getInstance()
        }
    }

    private fun setupControls() {
        findViewById<Button>(R.id.signInTab).setOnClickListener { setAuthMode(false) }
        findViewById<Button>(R.id.signUpTab).setOnClickListener { setAuthMode(true) }
        findViewById<Button>(R.id.emailAuthButton).setOnClickListener {
            val email = findViewById<EditText>(R.id.emailInput).text.toString().trim()
            val password = findViewById<EditText>(R.id.passwordInput).text.toString()
            if (email.isBlank() || password.length < 8) {
                toast("Vui lòng nhập email và mật khẩu có ít nhất 8 ký tự.")
            } else {
                toast("Giao diện tài khoản đã sẵn sàng; máy chủ xác thực chưa được cấu hình.")
            }
        }
        listOf(R.id.googleButton, R.id.facebookButton, R.id.appleButton).forEach { id ->
            findViewById<Button>(id).setOnClickListener {
                toast("Cần cấu hình OAuth client để bật đăng nhập xã hội.")
            }
        }
        findViewById<Button>(R.id.suggestionsToggle).setOnClickListener {
            val panel = findViewById<View>(R.id.suggestionsPanel)
            panel.visibility = if (panel.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        findViewById<SeekBar>(R.id.durationSlider).setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                val seconds = progress + 30
                findViewById<TextView>(R.id.durationLabel).text =
                    if (seconds < 60) "Thời lượng: $seconds giây"
                    else "Thời lượng: ${seconds / 60} phút ${seconds % 60} giây"
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })
        findViewById<Button>(R.id.generateButton).setOnClickListener { generateScenes() }
        findViewById<Button>(R.id.pickVideoButton).setOnClickListener {
            videoPicker.launch(arrayOf("video/*"))
        }
        findViewById<Button>(R.id.translateButton).setOnClickListener { translateVideo() }
        findViewById<SeekBar>(R.id.subtitleSizeSlider).setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                val subtitleSize = progress.coerceAtLeast(8)
                val preview = findViewById<TextView>(R.id.subtitlePreview)
                preview.textSize = subtitleSize.toFloat()
                preview.setShadowLayer(if (subtitleShadow) 5f else 0f, 2f, 2f, android.graphics.Color.BLACK)
                findViewById<TextView>(R.id.subtitleSizeLabel).text =
                    "Cỡ chữ: ${subtitleSize}sp · Bóng: ${if (subtitleShadow) "bật" else "tắt"}"
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })
        findViewById<Button>(R.id.subtitleShadowButton).setOnClickListener {
            subtitleShadow = !subtitleShadow
            findViewById<TextView>(R.id.subtitlePreview).setShadowLayer(
                if (subtitleShadow) 5f else 0f,
                2f,
                2f,
                android.graphics.Color.BLACK
            )
            findViewById<TextView>(R.id.subtitleSizeLabel).text =
                "Cỡ chữ: ${findViewById<SeekBar>(R.id.subtitleSizeSlider).progress.coerceAtLeast(8)}sp · Bóng: ${if (subtitleShadow) "bật" else "tắt"}"
            (it as Button).text = if (subtitleShadow) "Tắt bóng phụ đề" else "Bật bóng phụ đề"
        }
    }

    private fun setAuthMode(signUp: Boolean) {
        findViewById<Button>(R.id.emailAuthButton).text =
            if (signUp) "Tạo tài khoản" else "Tiếp tục với email"
    }

    // Dùng API discovery để lấy các node khả dụng thay vì yêu cầu nhập IP thủ công.
    private fun discoverService() {
        requestDiscovery(apiBaseUrl) { result ->
            if (result.first) {
                apiBaseUrl = result.second
                findViewById<TextView>(R.id.connectionStatus).text = "Đã kết nối · ${result.second}"
            } else {
                findViewById<TextView>(R.id.connectionStatus).text =
                    "Chưa kết nối máy chủ · kiểm tra API_BASE_URL và dịch vụ backend"
            }
        }
    }

    private fun requestDiscovery(startUrl: String, callback: (Pair<Boolean, String>) -> Unit) {
        executor.execute {
            val candidates = linkedSetOf(startUrl)
            try {
                val discovery = ApiClient.getJson("$startUrl/api/discovery")
                val nodes = discovery.optJSONArray("nodes")
                if (nodes != null) {
                    for (index in 0 until nodes.length()) {
                        val node = nodes.optString(index).trimEnd('/')
                        if (node.startsWith("http://") || node.startsWith("https://")) candidates.add(node)
                    }
                }
            } catch (_: Exception) {
                // Thử node cấu hình ban đầu; thông báo trạng thái nếu mọi node đều lỗi.
            }
            val connected = candidates.firstNotNullOfOrNull { candidate ->
                try {
                    ApiClient.getJson("$candidate/health")
                    candidate
                } catch (_: Exception) {
                    null
                }
            }
            runOnUiThread { callback(Pair(connected != null, connected ?: startUrl)) }
        }
    }

    private fun generateScenes() {
        val story = findViewById<EditText>(R.id.storyInput).text.toString().trim()
        if (story.isBlank()) {
            toast("Hãy nhập câu chuyện trước khi tạo phim.")
            return
        }
        findViewById<Button>(R.id.generateButton).isEnabled = false
        val duration = findViewById<SeekBar>(R.id.durationSlider).progress + 30
        val payload = JSONObject()
            .put("story", story)
            .put("durationSeconds", duration)
            .put("category", findViewById<Spinner>(R.id.categorySpinner).selectedItem.toString())
            .put("visualStyle", findViewById<Spinner>(R.id.styleSpinner).selectedItem.toString())
            .put("mood", findViewById<Spinner>(R.id.moodSpinner).selectedItem.toString())
            .put("generateImages", findViewById<CheckBox>(R.id.generateImagesCheck).isChecked)
        executor.execute {
            try {
                val response = ApiClient.postJson("$apiBaseUrl/api/video/generate", payload)
                val scenes = response.optJSONArray("scenes")
                val imageUrls = scenes?.let { sceneArray ->
                    (0 until sceneArray.length()).mapNotNull { index ->
                        sceneArray.optJSONObject(index)
                            ?.optString("imageUrl")
                            ?.takeIf(String::isNotBlank)
                    }
                }.orEmpty()
                val summary = buildString {
                    append(response.optString("title", "Kịch bản phim"))
                    append("\nKịch bản: ").append(response.optString("scriptProvider", "Gemini"))
                    append(" · Ảnh: ").append(response.optString("imageProvider", "Pollinations AI"))
                    if (scenes != null) {
                        for (index in 0 until scenes.length()) {
                            val scene = scenes.getJSONObject(index)
                            append("\n\nCảnh ${index + 1}: ")
                            append(scene.optString("narration", scene.optString("description")))
                            append("\nHình ảnh: ")
                            append(scene.optString("imagePrompt"))
                            if (scene.has("imageUrl")) {
                                append("\nẢnh phân cảnh: ").append(scene.optString("imageUrl"))
                            }
                        }
                    }
                }
                runOnUiThread {
                    findViewById<TextView>(R.id.generationResult).text = summary
                    val imageContainer = findViewById<LinearLayout>(R.id.generationImages)
                    imageContainer.removeAllViews()
                    val imageHeight = (240 * resources.displayMetrics.density).toInt()
                    imageUrls.forEachIndexed { index, imageUrl ->
                        val imageView = ImageView(this@MainActivity).apply {
                            contentDescription = "Ảnh phân cảnh ${index + 1}"
                            layoutParams = LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.MATCH_PARENT,
                                imageHeight
                            ).apply {
                                topMargin = (8 * resources.displayMetrics.density).toInt()
                            }
                            scaleType = ImageView.ScaleType.CENTER_CROP
                        }
                        imageContainer.addView(imageView)
                        Glide.with(this@MainActivity)
                            .load(imageUrl)
                            .centerCrop()
                            .into(imageView)
                    }
                }
            } catch (error: Exception) {
                runOnUiThread { toast("Không thể tạo kịch bản: ${error.message ?: "lỗi máy chủ"}") }
            } finally {
                runOnUiThread { findViewById<Button>(R.id.generateButton).isEnabled = true }
            }
        }
    }

    private fun translateVideo() {
        val videoUri = selectedVideo
        if (videoUri == null) {
            toast("Vui lòng chọn một video.")
            return
        }
        val language = findViewById<Spinner>(R.id.languageSpinner).selectedItem.toString()
            .replace(Regex("^\\S+\\s+"), "")
        val button = findViewById<Button>(R.id.translateButton)
        button.isEnabled = false
        executor.execute {
            try {
                val filename = contentResolver.query(videoUri, null, null, null, null)?.use { cursor ->
                    val column = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && column >= 0) cursor.getString(column) else "video.mp4"
                } ?: "video.mp4"
                val tempFile = File(cacheDir, "upload_${System.currentTimeMillis()}_${filename.replace(Regex("[^A-Za-z0-9._-]"), "_")}")
                contentResolver.openInputStream(videoUri)?.use { input ->
                    tempFile.outputStream().use { output -> input.copyTo(output) }
                } ?: error("Không thể đọc tệp video đã chọn.")
                try {
                    val result = ApiClient.postVideo("$apiBaseUrl/api/video/translate", tempFile, language)
                    runOnUiThread {
                        findViewById<TextView>(R.id.translationResult).text =
                            buildString {
                                append("Lồng tiếng: ").append(result.optString("voice", "gTTS"))
                                append("\n\nBản chép lời:\n").append(result.optString("transcript"))
                                append("\n\nBản dịch:\n").append(result.optString("translatedScript"))
                                append("\n\nVideo: ").append(result.optString("downloadUrl", "hoàn tất"))
                            }
                    }
                } finally {
                    tempFile.delete()
                }
            } catch (error: Exception) {
                runOnUiThread { toast("Không thể dịch video: ${error.message ?: "lỗi máy chủ"}") }
            } finally {
                runOnUiThread { button.isEnabled = true }
            }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
