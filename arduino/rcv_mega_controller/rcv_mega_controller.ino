/*
 * ==============================================================================
 * REQUIEM CABARET VOLTAIRE 2026 - LED STAGE CONTROLLER
 * Target Board: ELEGOO MEGA 2560 / Arduino Mega 2560 (ATmega2560)
 * LED Type:     WS2812B Addressable RGB Strip
 * Serial Speed: 115200 Baud
 * ==============================================================================
 */

#include <FastLED.h>

// -----------------------------------------------------------------------------
// HARDWARE CONFIGURATION
// -----------------------------------------------------------------------------
#define DATA_PIN        6       // Digital Pin connected to WS2812B DIN (Data In)
#define LED_TYPE        WS2812B // WS2812B chipset
#define COLOR_ORDER     GRB     // Most WS2812B strips use GRB order
#define MAX_LEDS        300     // Maximum supported LEDs (Mega 2560 has 8KB RAM)
#define SERIAL_BAUD     115200  // High-speed USB serial baud rate

CRGB leds[MAX_LEDS];
uint16_t activeLedCount = 80;

// Protocol Constants
#define SYNC_BYTE_1     0xAA
#define SYNC_BYTE_2     0x55

#define CMD_PING        0x00
#define CMD_SET_FRAME   0x01
#define CMD_CLEAR_ALL   0x02
#define CMD_GET_INFO    0x03

#define ACK_BYTE        0x06
#define NAK_BYTE        0x15

// State Machine for Serial Parsing
enum RxState {
  STATE_WAIT_SYNC1,
  STATE_WAIT_SYNC2,
  STATE_WAIT_CMD,
  STATE_WAIT_LEN_HI,
  STATE_WAIT_LEN_LO,
  STATE_WAIT_PAYLOAD,
  STATE_WAIT_CHECKSUM
};

RxState currentState = STATE_WAIT_SYNC1;
uint8_t currentCmd = 0;
uint16_t expectedPayloadLen = 0;
uint16_t payloadBytesRead = 0;
uint8_t calculatedChecksum = 0;
uint32_t lastByteTime = 0;

void setup() {
  // Initialize Serial
  Serial.begin(SERIAL_BAUD);
  while (!Serial && millis() < 2000) {
    ; // Wait for serial port on USB connection
  }

  // Initialize FastLED
  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, MAX_LEDS);
  FastLED.setBrightness(255); // Full brightness limit (UI sliders scale actual values)
  FastLED.clear();
  FastLED.show();

  // Startup indication: quick dark-green pulse on first 5 LEDs to signal readiness
  for (int i = 0; i < 5 && i < MAX_LEDS; i++) {
    leds[i] = CRGB(0, 40, 0);
  }
  FastLED.show();
  delay(150);
  FastLED.clear();
  FastLED.show();

  // Send ready greeting
  Serial.println(F("RCV_MEGA_2026_READY"));
}

void loop() {
  // Timeout protection: reset parser if stream stalls for > 60ms
  if (currentState != STATE_WAIT_SYNC1 && (millis() - lastByteTime > 60)) {
    currentState = STATE_WAIT_SYNC1;
  }

  while (Serial.available() > 0) {
    uint8_t b = Serial.read();
    lastByteTime = millis();

    switch (currentState) {
      case STATE_WAIT_SYNC1:
        if (b == SYNC_BYTE_1) {
          currentState = STATE_WAIT_SYNC2;
        }
        break;

      case STATE_WAIT_SYNC2:
        if (b == SYNC_BYTE_2) {
          currentState = STATE_WAIT_CMD;
        } else if (b != SYNC_BYTE_1) {
          currentState = STATE_WAIT_SYNC1;
        }
        break;

      case STATE_WAIT_CMD:
        currentCmd = b;
        calculatedChecksum = b;
        if (currentCmd == CMD_PING) {
          Serial.write(ACK_BYTE);
          Serial.println(F("RCV_PONG"));
          currentState = STATE_WAIT_SYNC1;
        } else if (currentCmd == CMD_CLEAR_ALL) {
          FastLED.clear();
          FastLED.show();
          Serial.write(ACK_BYTE);
          currentState = STATE_WAIT_SYNC1;
        } else if (currentCmd == CMD_GET_INFO) {
          Serial.print(F("RCV_INFO:MAX="));
          Serial.print(MAX_LEDS);
          Serial.print(F(":PIN="));
          Serial.println(DATA_PIN);
          currentState = STATE_WAIT_SYNC1;
        } else if (currentCmd == CMD_SET_FRAME) {
          currentState = STATE_WAIT_LEN_HI;
        } else {
          // Unknown command
          currentState = STATE_WAIT_SYNC1;
        }
        break;

      case STATE_WAIT_LEN_HI:
        expectedPayloadLen = ((uint16_t)b) << 8;
        calculatedChecksum ^= b;
        currentState = STATE_WAIT_LEN_LO;
        break;

      case STATE_WAIT_LEN_LO:
        expectedPayloadLen |= b;
        calculatedChecksum ^= b;
        payloadBytesRead = 0;

        // Sanity check length: must be multiple of 3 (RGB) and <= MAX_LEDS * 3
        if (expectedPayloadLen == 0 || expectedPayloadLen > (MAX_LEDS * 3) || (expectedPayloadLen % 3 != 0)) {
          Serial.write(NAK_BYTE);
          currentState = STATE_WAIT_SYNC1;
        } else {
          currentState = STATE_WAIT_PAYLOAD;
        }
        break;

      case STATE_WAIT_PAYLOAD: {
        uint16_t ledIndex = payloadBytesRead / 3;
        uint8_t channelIndex = payloadBytesRead % 3;

        if (channelIndex == 0) leds[ledIndex].r = b;
        else if (channelIndex == 1) leds[ledIndex].g = b;
        else if (channelIndex == 2) leds[ledIndex].b = b;

        calculatedChecksum ^= b;
        payloadBytesRead++;

        if (payloadBytesRead >= expectedPayloadLen) {
          currentState = STATE_WAIT_CHECKSUM;
        }
        break;
      }

      case STATE_WAIT_CHECKSUM:
        if (b == calculatedChecksum) {
          // Clear any remaining unaddressed LEDs
          uint16_t updatedLeds = expectedPayloadLen / 3;
          for (uint16_t i = updatedLeds; i < MAX_LEDS; i++) {
            leds[i] = CRGB::Black;
          }
          FastLED.show();
          Serial.write(ACK_BYTE);
        } else {
          Serial.write(NAK_BYTE);
        }
        currentState = STATE_WAIT_SYNC1;
        break;
    }
  }
}
