package br.com.fortalezamov.comercio

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Ajustes de cada fabricante no app do Comercio (Evandro, 10/11/2026:
 * "pode fazer isso no aplicativo do passageiro tambem").
 *
 * Xiaomi, Samsung, Oppo, Vivo, Huawei... tem ajustes proprios que fecham o
 * aplicativo em segundo plano ou escondem a chamada. O Android nao informa
 * esses ajustes, entao o motorista abre cada tela por aqui e confirma que
 * deixou certo. A confirmacao fica guardada no celular.
 */
object Aparelho {
    private const val PREFS = "fortaleza_permissoes"

    /** Familia do sistema: decide quais ajustes extras aparecem. */
    fun familia(): String {
        val m = "${Build.MANUFACTURER} ${Build.BRAND}".lowercase()
        return when {
            m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") -> "xiaomi"
            m.contains("samsung") -> "samsung"
            m.contains("oppo") || m.contains("realme") || m.contains("oneplus") -> "oppo"
            m.contains("vivo") || m.contains("iqoo") -> "vivo"
            m.contains("huawei") -> "huawei"
            m.contains("honor") -> "honor"
            m.contains("motorola") || m.contains("lenovo") -> "motorola"
            m.contains("asus") -> "asus"
            else -> "outro"
        }
    }

    /** Ajustes extras que cada familia precisa (a tela mostra so estes). */
    // Comercio: so o que segura o alarme "motorista chegou" com o app
    // minimizado durante a entrega (tudo recomendado, nada trava o pedido).
    fun extras(): List<String> = when (familia()) {
        "xiaomi" -> listOf("inicioAutomatico", "bateriaFabricante")
        "samsung" -> listOf("nuncaSuspender")
        "oppo" -> listOf("inicioAutomatico", "segundoPlano")
        "vivo" -> listOf("inicioAutomatico", "segundoPlano")
        "huawei", "honor" -> listOf("inicioAutomatico")
        "asus" -> listOf("inicioAutomatico")
        else -> emptyList()
    }

    private fun prop(nome: String): String = try {
        val c = Class.forName("android.os.SystemProperties")
        (c.getMethod("get", String::class.java).invoke(null, nome) as? String).orEmpty()
    } catch (e: Exception) {
        ""
    }

    /** Nome do sistema como o motorista ve nos ajustes (HyperOS, MIUI, One UI...). */
    fun sistema(): String {
        val hyper = prop("ro.mi.os.version.name")
        if (hyper.isNotBlank()) return "HyperOS ${hyper.removePrefix("OS")}".trim()
        val miui = prop("ro.miui.ui.version.name")
        if (miui.isNotBlank()) return "MIUI ${miui.removePrefix("V")}"
        val coloros = prop("ro.build.version.opporom")
        if (coloros.isNotBlank()) return "ColorOS ${coloros.removePrefix("V")}"
        val vivo = prop("ro.vivo.os.version")
        if (vivo.isNotBlank()) return "Funtouch/OriginOS $vivo"
        val emui = prop("ro.build.version.emui")
        if (emui.isNotBlank()) return emui.replace('_', ' ')
        if (familia() == "samsung") return "One UI"
        return "Android"
    }

    fun perfil(ctx: Context): Map<String, Any> = mapOf(
        "familia" to familia(),
        "marca" to (Build.BRAND ?: "").replaceFirstChar { it.uppercase() },
        "modelo" to (Build.MODEL ?: ""),
        "sistema" to sistema(),
        "android" to (Build.VERSION.RELEASE ?: ""),
        "sdk" to Build.VERSION.SDK_INT,
        "extras" to extras(),
        "confirmados" to extras().filter { confirmado(ctx, it) },
    )

    fun confirmado(ctx: Context, chave: String): Boolean {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // Versao 340 guardava so a bateria do Xiaomi com outro nome.
        if (chave == "bateriaFabricante" && p.getBoolean("bateriaXiaomi", false)) return true
        return p.getBoolean("confirmado_$chave", false)
    }

    fun confirmar(ctx: Context, chave: String, sim: Boolean) {
        val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        e.putBoolean("confirmado_$chave", sim)
        if (chave == "bateriaFabricante" && !sim) e.putBoolean("bateriaXiaomi", false)
        e.apply()
    }

    /** Abre a tela do fabricante; se o aparelho nao tiver, os ajustes do app. */
    fun abrir(ctx: Context, chave: String) {
        val pacote = ctx.packageName
        val nome = try {
            ctx.packageManager.getApplicationLabel(ctx.applicationInfo).toString()
        } catch (e: Exception) {
            "Fortaleza Move"
        }
        val tentativas = mutableListOf<Intent>()
        fun tela(p: String, c: String) = Intent().setClassName(p, c)
        when ("${familia()}:$chave") {
            "xiaomi:inicioAutomatico" -> {
                tentativas += tela("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
            }
            "xiaomi:bateriaFabricante" -> {
                // Tela de bateria DESTE app na Xiaomi: "Nenhuma restricao".
                tentativas += tela("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")
                    .putExtra("package_name", pacote).putExtra("package_label", nome)
                if (Build.VERSION.SDK_INT >= 23) {
                    tentativas += Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                }
            }
            "xiaomi:outrasPermissoes" -> {
                // "Outras permissoes": janelas pop-up em segundo plano e tela de bloqueio.
                tentativas += Intent("miui.intent.action.APP_PERM_EDITOR")
                    .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                    .putExtra("extra_pkgname", pacote)
                tentativas += Intent("miui.intent.action.APP_PERM_EDITOR")
                    .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity")
                    .putExtra("extra_pkgname", pacote)
            }
            "samsung:nuncaSuspender" -> {
                tentativas += tela("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")
                tentativas += tela("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")
            }
            "oppo:inicioAutomatico" -> {
                tentativas += tela("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
                tentativas += tela("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
                tentativas += tela("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
                tentativas += tela("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity")
            }
            "vivo:inicioAutomatico" -> {
                tentativas += tela("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
                tentativas += tela("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
                tentativas += tela("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")
            }
            "vivo:segundoPlano" -> {
                tentativas += tela("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgPowerManagerActivity")
                tentativas += tela("com.vivo.abe", "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity")
            }
            "huawei:inicioAutomatico" -> {
                tentativas += tela("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                tentativas += tela("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
            }
            "honor:inicioAutomatico" -> {
                tentativas += tela("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                tentativas += tela("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
            }
            "asus:inicioAutomatico" -> {
                tentativas += tela("com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity")
                tentativas += tela("com.asus.mobilemanager", "com.asus.mobilemanager.MainActivity")
            }
        }
        // "travarRecentes" e "segundoPlano" (Oppo) nao tem tela propria: o
        // texto explica; o botao abre os ajustes do app.
        tentativas += Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pacote"))
        for (i in tentativas) {
            try {
                ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (e: Exception) {
                // Nao existe neste aparelho (ou nao e exportada): tenta a proxima.
            }
        }
    }
}
