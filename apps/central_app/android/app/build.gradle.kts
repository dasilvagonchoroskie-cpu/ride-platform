import java.io.FileInputStream
import java.util.Properties

// Assinatura de producao (Google Play): as credenciais nunca ficam no
// codigo. O CI decodifica o segredo do GitHub num arquivo temporario e
// escreve este key.properties antes de compilar. Sem ele (por exemplo,
// no `flutter run` de um desenvolvedor sem as credenciais), o build cai
// de volta para a chave de depuracao — e continua funcionando local.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val temAssinaturaDeProducao = keystorePropertiesFile.exists()
if (temAssinaturaDeProducao) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.rideplatform.central_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.rideplatform.central_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (temAssinaturaDeProducao) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Assina com a chave de producao quando ela existe; sem ela,
            // volta para a chave de depuracao (para nao travar builds
            // locais de quem nao tem as credenciais).
            signingConfig = if (temAssinaturaDeProducao) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
