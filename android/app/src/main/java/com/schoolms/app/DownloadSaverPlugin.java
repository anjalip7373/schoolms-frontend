package com.schoolms.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * DownloadSaverPlugin
 * -------------------
 * Saves a base64-encoded file DIRECTLY to the public Downloads folder
 * using Android's MediaStore.Downloads API (Android 10+/API 29+).
 *
 * No WRITE_EXTERNAL_STORAGE or MANAGE_EXTERNAL_STORAGE permission needed —
 * MediaStore writes to Downloads/ are always allowed by the OS for any app.
 * This is the same mechanism Chrome/WhatsApp use to silently save files.
 *
 * Falls back to the legacy direct-file-write method for Android 9 and below.
 */
@CapacitorPlugin(name = "DownloadSaver")
public class DownloadSaverPlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (fileName == null || base64Data == null) {
            call.reject("fileName and base64Data are required");
            return;
        }

        try {
            byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ — use MediaStore (no permission required)
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri itemUri = resolver.insert(collection, values);

                if (itemUri == null) {
                    call.reject("Failed to create MediaStore entry");
                    return;
                }

                try (OutputStream out = resolver.openOutputStream(itemUri)) {
                    if (out == null) {
                        call.reject("Failed to open output stream");
                        return;
                    }
                    out.write(fileBytes);
                    out.flush();
                }

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(itemUri, values, null, null);

                JSObject ret = new JSObject();
                ret.put("uri", itemUri.toString());
                ret.put("fileName", fileName);
                call.resolve(ret);

            } else {
                // Android 9 and below — legacy direct file write
                java.io.File downloadsDir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS
                );
                if (!downloadsDir.exists()) downloadsDir.mkdirs();

                java.io.File outFile = new java.io.File(downloadsDir, fileName);
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile)) {
                    fos.write(fileBytes);
                    fos.flush();
                }

                JSObject ret = new JSObject();
                ret.put("uri", Uri.fromFile(outFile).toString());
                ret.put("fileName", fileName);
                call.resolve(ret);
            }

        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage(), e);
        }
    }
}