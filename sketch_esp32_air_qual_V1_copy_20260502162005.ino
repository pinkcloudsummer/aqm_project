#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <SensirionI2cSen66.h>
#include <Wire.h>
#include "DFRobot_OzoneSensor.h"
#include "DFRobot_MICS.h"
#include <Adafruit_BMP3XX.h>

// ── WiFi & MQTT config ───────────────────────────────────────────
const char* WIFI_SSID      = "MenialCommunicationNetwork";
const char* WIFI_PASSWORD  = "1mu18a7E0011f";
const char* MQTT_SERVER    = "192.168.1.127";   // e.g. "192.168.1.100"
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "ESP32_AirQuality";

#define PUBLISH_INTERVAL_MS 10000UL   // push to NAS every 10s

// ── Analog pins (ADC1 only: GPIO0-4, safe with WiFi active) ─────
#define ANALOG_PIN_A        0
#define ANALOG_PIN_B        1
#define ANALOG_PIN_LABEL_A  "SEN0574 NO2 (GPIO0)"
#define ANALOG_PIN_LABEL_B  "SEN0132 CO  (GPIO1)"

// ── SEN0574 NO2 calibration ──────────────────────────────────────
// NO2_RL_KOHM : load resistor on DFRobot board — verify from PCB/wiki (~10kΩ typical)
// NO2_R0_KOHM : sensor resistance in clean air — run calibrateNO2R0() after 24h warmup
#define NO2_RL_KOHM     10.0f
#define NO2_R0_KOHM     100.0f   // PLACEHOLDER — must calibrate first
#define NO2_CALIBRATED  false    // flip to true once NO2_R0_KOHM is measured

// ── SEN0132 CO calibration ───────────────────────────────────────
// CO_RL_KOHM  : load resistor on SEN0132 board (10kΩ)
// CO_R0_KOHM  : sensor resistance in clean air — run calibrateCOR0() after 48h warmup
// Voltage divider: R1=1.8kΩ (top), R2=3.2kΩ (bottom)
//   V_sensor = V_adc × (R1+R2)/R2 = V_adc × 1.5625
#define CO_RL_KOHM      10.0f
#define CO_R0_KOHM      100.0f   // PLACEHOLDER — must calibrate first
#define CO_CALIBRATED   false    // flip to true once CO_R0_KOHM is measured
#define CO_DIV_FACTOR   (5.0f / 3.2f)   // undoes the voltage divider

// ── I2C addresses ────────────────────────────────────────────────
#define OZONE_I2C_ADDR  OZONE_ADDRESS_3   // 0x73
#define MICS_I2C_ADDR   0x75
#define BMP388_I2C_ADDR 0x77
#define SEA_LEVEL_HPA   1013.25f

SensirionI2cSen66   sen66;
DFRobot_OzoneSensor ozone(&Wire);
DFRobot_MICS_I2C    mics(&Wire, MICS_I2C_ADDR);
Adafruit_BMP3XX     bmp388;
bool                bmp388Ready = false;

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long lastPublishMs   = 0;
unsigned long lastReconnectMs = 0;

// ── NO2 helpers ──────────────────────────────────────────────────

float readNO2Rs() {
    int sum = 0;
    for (int i = 0; i < 16; i++) { sum += analogRead(ANALOG_PIN_A); delay(1); }
    float voltage = (sum / 16.0f) * (3.3f / 4095.0f);
    if (voltage < 0.01f) return -1.0f;
    return (3.3f / voltage - 1.0f) * NO2_RL_KOHM;
}

void calibrateNO2R0() {
    Serial.println(">> SEN0574 calibration: sampling R0 in clean air (5 sec)...");
    float total = 0;
    for (int i = 0; i < 10; i++) { total += readNO2Rs(); delay(500); }
    Serial.print(">> Set NO2_R0_KOHM = "); Serial.print(total / 10.0f, 2);
    Serial.println("  then set NO2_CALIBRATED true");
}

// ── CO helpers ───────────────────────────────────────────────────

float readCORs() {
    int sum = 0;
    for (int i = 0; i < 16; i++) { sum += analogRead(ANALOG_PIN_B); delay(1); }
    float v_adc    = (sum / 16.0f) * (3.3f / 4095.0f);
    float v_sensor = v_adc * CO_DIV_FACTOR;   // recover true sensor output voltage
    if (v_sensor < 0.01f) return -1.0f;
    return (5.0f / v_sensor - 1.0f) * CO_RL_KOHM;
}

void calibrateCOR0() {
    Serial.println(">> SEN0132 calibration: sampling R0 in clean air (5 sec)...");
    float total = 0;
    for (int i = 0; i < 10; i++) { total += readCORs(); delay(500); }
    Serial.print(">> Set CO_R0_KOHM = "); Serial.print(total / 10.0f, 2);
    Serial.println("  then set CO_CALIBRATED true");
}

// ── MQTT publish helpers ─────────────────────────────────────────

void pub(const char* topic, float val, int dp = 2) {
    char buf[16];
    dtostrf(val, 1, dp, buf);
    mqtt.publish(topic, buf);
}

void pub(const char* topic, uint16_t val) {
    char buf[8];
    snprintf(buf, sizeof(buf), "%u", val);
    mqtt.publish(topic, buf);
}

// ── WiFi / MQTT connection management ───────────────────────────

void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.print("WiFi connecting");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) {
        delay(250); Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("WiFi connected: "); Serial.println(WiFi.localIP());
    } else {
        Serial.println("WiFi unavailable — running offline, will retry");
    }
}

// Non-blocking: called every loop(), retries every 5s if disconnected.
// Sensors keep running regardless of MQTT state.
void mqttMaintain() {
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
        return;
    }
    if (mqtt.connected()) {
        mqtt.loop();
        return;
    }
    if (millis() - lastReconnectMs < 5000) return;
    lastReconnectMs = millis();
    Serial.print("MQTT connecting...");
    if (mqtt.connect(MQTT_CLIENT_ID)) {
        Serial.println(" connected");
    } else {
        Serial.print(" failed rc="); Serial.println(mqtt.state());
    }
}

// ── Debug scan helpers ───────────────────────────────────────────

void scanAnalogPins() {
    Serial.println("--- Analog Pin Status ---");
    int pins[]           = { ANALOG_PIN_A,       ANALOG_PIN_B };
    const char* labels[] = { ANALOG_PIN_LABEL_A, ANALOG_PIN_LABEL_B };

    for (int i = 0; i < 2; i++) {
        int minVal = 4095, maxVal = 0, sum = 0;
        for (int s = 0; s < 16; s++) {
            int v = analogRead(pins[i]);
            sum += v;
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
            delay(1);
        }
        int   avg    = sum / 16;
        int   spread = maxVal - minVal;
        float volts  = avg * (3.3f / 4095.0f);

        Serial.print("  "); Serial.print(labels[i]); Serial.print(": ");
        if (spread > 300) {
            Serial.print("FLOATING/DISCONNECTED (noise spread=");
            Serial.print(spread); Serial.println(")");
        } else {
            Serial.print(volts, 2); Serial.print("V  raw=");
            Serial.print(avg); Serial.print("  (spread=");
            Serial.print(spread); Serial.println(")");
        }
    }
    Serial.println("-------------------------\n");
}

void scanI2CBus() {
    Serial.println("--- I2C Bus Scan ---");
    int found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.print("  Device at 0x");
            if (addr < 16) Serial.print("0");
            Serial.print(addr, HEX);
            if      (addr == 0x6B) Serial.print("  <-- SEN66");
            else if (addr == 0x73) Serial.print("  <-- SEN0321 Ozone");
            else if (addr == 0x75) Serial.print("  <-- SEN0377 MiCS");
            else if (addr == 0x77) Serial.print("  <-- BMP388 Pressure");
            Serial.println();
            found++;
        }
    }
    if (found == 0) Serial.println("  No devices found.");
    else { Serial.print("  Total devices: "); Serial.println(found); }
    Serial.println("--------------------\n");
}

// ── setup ────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(1000); // brief pause for serial to connect if available, then continue regardless

    analogSetPinAttenuation(ANALOG_PIN_A, ADC_11db);
    analogSetPinAttenuation(ANALOG_PIN_B, ADC_11db);

    Wire.begin(8, 9);  // ESP32-C3: SDA=8, SCL=9
    delay(500);

    sen66.begin(Wire, 0x6B);
    uint16_t sen66Err = sen66.startContinuousMeasurement();
    if (sen66Err) { Serial.print("!! SEN66 Init Error: "); Serial.println(sen66Err); }
    else          { Serial.println("SEN66 Online."); }

    if (!ozone.begin(OZONE_I2C_ADDR)) {
        Serial.println("!! SEN0321 Ozone init failed — check address & wiring");
    } else {
        Serial.println("SEN0321 Ozone Online.");
    }

    if (!mics.begin()) {
        Serial.println("!! SEN0377 MiCS init failed — check address & wiring");
    } else {
        mics.wakeUpMode();
        Serial.println("SEN0377 MiCS Online. Allow 3 min warmup for accurate readings.");
    }

    if (!bmp388.begin_I2C(BMP388_I2C_ADDR, &Wire)) {
        Serial.println("!! BMP388 init failed — check address & wiring");
    } else {
        bmp388.setTemperatureOversampling(BMP3_OVERSAMPLING_8X);
        bmp388.setPressureOversampling(BMP3_OVERSAMPLING_4X);
        bmp388.setIIRFilterCoeff(BMP3_IIR_FILTER_COEFF_3);
        bmp388.setOutputDataRate(BMP3_ODR_50_HZ);
        bmp388Ready = true;
        Serial.println("BMP388 Online.");
    }

    delay(1000);

    // CALIBRATION MODE — remove these lines after recording R0 values
    calibrateNO2R0();
    calibrateCOR0();

    connectWiFi();
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
}

// ── loop ─────────────────────────────────────────────────────────

void loop() {
    mqttMaintain();

    float    pm1p0, pm2p5, pm4p0, pm10p0;
    float    humidity, temperature, vocIndex, noxIndex;
    uint16_t co2Ppm;

    int16_t readError = sen66.readMeasuredValues(
        pm1p0, pm2p5, pm4p0, pm10p0,
        humidity, temperature,
        vocIndex, noxIndex,
        co2Ppm
    );

    if (readError) {
        Serial.print("SEN66 Read Error: "); Serial.println(readError);
    } else {
        // Read all sensors once and cache — avoids double I2C reads for serial + MQTT
        bool    micsReady = mics.warmUpTime(3);
        float   no2Rs     = readNO2Rs();
        float   no2Ratio  = (no2Rs > 0) ? no2Rs / NO2_R0_KOHM : -1.0f;
        float   co_rs     = readCORs();
        float   co_ratio  = (co_rs > 0) ? co_rs / CO_R0_KOHM : -1.0f;
        int16_t ozoneData = ozone.readOzoneData(20);

        float mics_co = 0, mics_no2 = 0, mics_c2h5oh = 0;
        float mics_h2 = 0, mics_nh3 = 0, mics_ch4 = 0;
        if (micsReady) {
            mics_co     = mics.getGasData(CO);
            mics_no2    = mics.getGasData(NO2);
            mics_c2h5oh = mics.getGasData(C2H5OH);
            mics_h2     = mics.getGasData(H2);
            mics_nh3    = mics.getGasData(NH3);
            mics_ch4    = mics.getGasData(CH4);
        }

        float bmpPressure = -1.0f, bmpTempC = -1.0f, bmpAltitude = -1.0f;
        if (bmp388Ready && bmp388.performReading()) {
            bmpPressure = bmp388.pressure / 100.0f;
            bmpTempC    = bmp388.temperature;
            bmpAltitude = bmp388.readAltitude(SEA_LEVEL_HPA);
        }

        // ── Serial report ────────────────────────────────────────
        Serial.println("\n========= Air Quality Report =========");
        Serial.print("  WiFi: ");
        Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline");
        Serial.print("  MQTT: "); Serial.println(mqtt.connected() ? "connected" : "offline");

        Serial.println("-- Particulate Matter (SEN66) --");
        Serial.print("  PM1.0:  "); Serial.print(pm1p0);  Serial.println(" µg/m³");
        Serial.print("  PM2.5:  "); Serial.print(pm2p5);  Serial.println(" µg/m³");
        Serial.print("  PM4.0:  "); Serial.print(pm4p0);  Serial.println(" µg/m³");
        Serial.print("  PM10.0: "); Serial.print(pm10p0); Serial.println(" µg/m³");

        Serial.println("-- Gas & Climate (SEN66) --");
        Serial.print("  CO2:   "); Serial.print(co2Ppm);      Serial.println(" ppm");
        Serial.print("  VOC:   "); Serial.println(vocIndex);
        Serial.print("  NOx:   "); Serial.println(noxIndex);
        Serial.print("  Temp:  "); Serial.print(temperature); Serial.println(" °C");
        Serial.print("  Humid: "); Serial.print(humidity);    Serial.println(" %");

        Serial.println("-- NO2 (SEN0574) --");
        if (no2Rs < 0) {
            Serial.println("  NO2: floating/disconnected");
        } else {
            Serial.print("  Rs:    "); Serial.print(no2Rs, 2);    Serial.println(" kΩ");
            Serial.print("  Rs/R0: "); Serial.println(no2Ratio, 3);
            if (!NO2_CALIBRATED) {
                Serial.println("  [UNCALIBRATED — calibrate in clean air after 24h warmup]");
            } else {
                float no2Ppm = 5.0f * pow(no2Ratio / 2.0f, 2.0f);
                Serial.print("  NO2:   "); Serial.print(no2Ppm, 3); Serial.println(" ppm (approx)");
            }
        }

        Serial.println("-- Ozone (SEN0321) --");
        Serial.print("  O3:    "); Serial.print(ozoneData); Serial.println(" ppb");

        Serial.println("-- CO (SEN0132) --");
        if (co_rs < 0) {
            Serial.println("  CO: floating/disconnected");
        } else {
            Serial.print("  Rs:    "); Serial.print(co_rs, 2);   Serial.println(" kΩ");
            Serial.print("  Rs/R0: "); Serial.println(co_ratio, 3);
            if (!CO_CALIBRATED) {
                Serial.println("  [UNCALIBRATED — calibrate in clean air after 48h warmup]");
            } else {
                float co_ppm = 99.042f * powf(co_ratio, -1.518f);
                Serial.print("  CO:    "); Serial.print(co_ppm, 1); Serial.println(" ppm (approx)");
            }
        }

        Serial.println("-- Pressure (BMP388) --");
        if (bmpPressure < 0) {
            Serial.println("  BMP388: no data");
        } else {
            Serial.print("  Pressure: "); Serial.print(bmpPressure, 1); Serial.println(" hPa");
            Serial.print("  Altitude: "); Serial.print(bmpAltitude, 0); Serial.println(" m");
            Serial.print("  Temp:     "); Serial.print(bmpTempC,    1); Serial.println(" °C");
        }

        Serial.println("-- Multi-Gas (SEN0377 MiCS-4514) --");
        if (!micsReady) {
            Serial.println("  [Warming up — check back in 3 min]");
        } else {
            Serial.print("  CO:     "); Serial.print(mics_co);     Serial.println(" ppm");
            Serial.print("  NO2:    "); Serial.print(mics_no2);    Serial.println(" ppm");
            Serial.print("  C2H5OH: "); Serial.print(mics_c2h5oh);Serial.println(" ppm");
            Serial.print("  H2:     "); Serial.print(mics_h2);     Serial.println(" ppm");
            Serial.print("  NH3:    "); Serial.print(mics_nh3);    Serial.println(" ppm");
            Serial.print("  CH4:    "); Serial.print(mics_ch4);    Serial.println(" ppm");
        }

        SEN66DeviceStatus status;
        int16_t statusError = sen66.readDeviceStatus(status);
        if (!statusError && status.value != 0) {
            Serial.print("!! SEN66 HARDWARE ALERT: "); Serial.println(status.value);
            sen66.readAndClearDeviceStatus(status);
        }

        Serial.println("======================================");

        // ── MQTT publish (every 10s, only if connected) ──────────
        if (mqtt.connected() && millis() - lastPublishMs >= PUBLISH_INTERVAL_MS) {
            lastPublishMs = millis();

            pub("home/air/pm1",         pm1p0);
            pub("home/air/pm2p5",       pm2p5);
            pub("home/air/pm4",         pm4p0);
            pub("home/air/pm10",        pm10p0);
            pub("home/air/co2",         co2Ppm);
            pub("home/air/voc",         vocIndex);
            pub("home/air/nox",         noxIndex);
            pub("home/air/temperature", temperature);
            pub("home/air/humidity",    humidity);
            pub("home/air/o3",          (float)ozoneData, 0);

            if (no2Rs > 0) {
                pub("home/air/no2/rs",    no2Rs);
                pub("home/air/no2/ratio", no2Ratio);
                if (NO2_CALIBRATED) {
                    pub("home/air/no2/ppm", 5.0f * pow(no2Ratio / 2.0f, 2.0f), 3);
                }
            }

            if (co_rs > 0) {
                pub("home/air/sen0132/rs",    co_rs);
                pub("home/air/sen0132/ratio", co_ratio);
                if (CO_CALIBRATED) {
                    pub("home/air/sen0132/co", 99.042f * powf(co_ratio, -1.518f), 1);
                }
            }

            if (bmpPressure >= 0) {
                pub("home/air/bmp388/pressure",    bmpPressure, 1);
                pub("home/air/bmp388/altitude",    bmpAltitude, 0);
                pub("home/air/bmp388/temperature", bmpTempC,    1);
            }

            if (micsReady) {
                pub("home/air/mics/co",     mics_co);
                pub("home/air/mics/no2",    mics_no2);
                pub("home/air/mics/c2h5oh", mics_c2h5oh);
                pub("home/air/mics/h2",     mics_h2);
                pub("home/air/mics/nh3",    mics_nh3);
                pub("home/air/mics/ch4",    mics_ch4);
            }

            Serial.println(">> Published to MQTT");
        }
    }

    scanI2CBus();
    scanAnalogPins();
    delay(2000);
}
