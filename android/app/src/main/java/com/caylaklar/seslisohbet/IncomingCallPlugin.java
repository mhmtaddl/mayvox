package com.caylaklar.seslisohbet;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "IncomingCall",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class IncomingCallPlugin extends Plugin {

    private static final int MICROPHONE_REQUEST_CODE = 1001;
    private static final int NOTIFICATION_REQUEST_CODE = 1002;

    /* ─── Mikrofon ────────────────────────────────────────────── */

    @PluginMethod
    public void checkMicrophonePermission(PluginCall call) {
        String status = getMicrophoneStatus();
        JSObject ret = new JSObject();
        ret.put("microphone", status);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("microphone", "granted");
            call.resolve(ret);
            return;
        }
        // Capacitor'ün permission framework'ünü kullan
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        String status = getMicrophoneStatus();
        JSObject ret = new JSObject();
        ret.put("microphone", status);
        call.resolve(ret);
    }

    /* ─── Bildirim ────────────────────────────────────────────── */

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("notifications", getNotificationStatus());
        ret.put("fullScreen", "granted"); // Android'de her zaman izinli
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            // Android 12 ve altında bildirim izni otomatik verilir
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
            return;
        }

        if (ContextCompat.checkSelfPermission(getActivity(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        String status = getNotificationStatus();
        JSObject ret = new JSObject();
        ret.put("notifications", status);
        call.resolve(ret);
    }

    /* ─── Ayarlar ─────────────────────────────────────────────── */

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Ayarlar açılamadı", e);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 26) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getActivity().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Bildirim ayarları açılamadı", e);
        }
    }

    /* ─── Stub: show / dismiss (gelecekte bildirim UI için) ──── */

    @PluginMethod
    public void show(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        call.resolve();
    }

    /* ─── APK Kurulum ─────────────────────────────────────────── */

    @PluginMethod
    public void installApk(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = call.getString("fileName", "update.apk");
        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 verisi eksik");
            return;
        }

        try {
            // Base64 → dosya
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File dir = new File(getActivity().getExternalFilesDir(null), "updates");
            if (!dir.exists()) dir.mkdirs();
            File apkFile = new File(dir, fileName);
            FileOutputStream fos = new FileOutputStream(apkFile);
            fos.write(bytes);
            fos.close();

            // FileProvider URI ile install intent
            Uri apkUri = FileProvider.getUriForFile(
                getActivity(),
                getActivity().getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("APK kurulumu başlatılamadı", e);
        }
    }

    @PluginMethod
    public void canInstallApk(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= 26) {
            ret.put("allowed", getActivity().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("allowed", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Ayarlar açılamadı", e);
        }
    }

    /* ─── Yardımcılar ─────────────────────────────────────────── */

    private String getMicrophoneStatus() {
        int result = ContextCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO);
        return result == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
    }

    private String getNotificationStatus() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        int result = ContextCompat.checkSelfPermission(getActivity(), Manifest.permission.POST_NOTIFICATIONS);
        return result == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
    }
}
