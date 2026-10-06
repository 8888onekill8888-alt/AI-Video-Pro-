package com.aivideostudio

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object ApiClient {
    fun getJson(url: String): JSONObject =
        requestJson(url, "GET")

    fun postJson(url: String, payload: JSONObject): JSONObject =
        requestJson(url, "POST", payload.toString().toByteArray(Charsets.UTF_8))

    private fun requestJson(url: String, method: String, body: ByteArray? = null): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 60_000
        connection.readTimeout = 10 * 60_000
        connection.setRequestProperty("Accept", "application/json")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { it.write(body) }
        }
        return readResponse(connection)
    }
    fun postVideo(url: String, file: File, language: String): JSONObject {
        val boundary = "----AIVideoStudio${UUID.randomUUID()}"
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 60_000
        connection.readTimeout = 10 * 60_000
        connection.doOutput = true
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        connection.outputStream.buffered().use { output ->
            fun field(name: String, value: String) {
                output.write("--$boundary\r\n".toByteArray())
                output.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n".toByteArray())
            }
            field("targetLanguage", language)
            output.write("--$boundary\r\n".toByteArray())
            output.write(
                "Content-Disposition: form-data; name=\"video\"; filename=\"${file.name}\"\r\n".toByteArray()
            )
            output.write("Content-Type: video/mp4\r\n\r\n".toByteArray())
            file.inputStream().use { it.copyTo(output) }
            output.write("\r\n--$boundary--\r\n".toByteArray())
        }
        return readResponse(connection)
    }

    private fun readResponse(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrDefault(text)
                error("HTTP $status: $message")
            }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
