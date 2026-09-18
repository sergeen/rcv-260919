# REQUIEM CABARET VOLTAIRE 2026 - LED STAGE CONTROLLER

A specialized mobile-optimized web interface and hardware bridge to control addressable **WS2812B** LED strips using an **ELEGOO MEGA 2560** (Arduino Mega 2560-compatible) via USB serial.

---

## System Architecture

```
  ┌─────────────────────────────────────────────────────────┐
  │                 SMARTPHONE / BROWSER                    │
  │     Mobile Landscape UI: Segments, Circles, Scenes      │
  │          HTML5 Interactive Stage & Glitch Engine        │
  └────────────────────────────┬────────────────────────────┘
                               │ Wi-Fi (WebSocket + HTTP)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │             HOST COMPUTER (Node.js Server)              │
  │   - Static HTTP Server (Mobile Web UI)                  │
  │   - WebSocket Server (State synchronization & frames)   │
  │   - State Persistence (data/scenes_state.json)          │
  │   - USB Serial Manager (Auto-connect & simulation mode) │
  └────────────────────────────┬────────────────────────────┘
                               │ USB Serial (115200 Baud)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │         ELEGOO MEGA 2560 (FastLED C++ Firmware)         │
  │   - High-speed binary framing protocol (0xAA 0x55 ...)  │
  │   - Digital Pin 6 to WS2812B DIN                        │
  └────────────────────────────┬────────────────────────────┘
                               │ High-Speed PWM
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │             WS2812B ADDRESSABLE LED STRIP               │
  └─────────────────────────────────────────────────────────┘
```

---

## Visual Design & Aesthetics

- **Cyberpunk Dark Green Palette**: Deep `#000000` black stage with electric `#00ff41` neon green accents.
- **Stage Frame**: 4px solid green border.
- **Grouping Boxes**: 1px crisp borders.
- **Active Elements**: Fade-and-blink animation transitioning between electric green and deep crimson red (`#8b0000` / `#ff2233`).
- **Mobile Landscape Optimized**: Full viewport lock, responsive Canvas resolution (logical `1000 x 500`), and multi-touch dragging.

---

## Artistic Glitch Engine (Cabaret Voltaire × Nam June Paik × Ryoji Ikeda)

The glitch engine maps the **GLICH** slider (0% to 100%) and the three status indicators (`□□□`) across three distinct behavioral regimes:

1. **Phase 1: Analog Degradation & Tape Sag (`■□□` / 1% – 33%)**
   - *Inspiration*: Cabaret Voltaire early tape loops & degraded audio-visual broadcasts.
   - Sporadic single-LED micro-dropouts (1–2 frame blackouts).
   - Voltage sag simulation: subtle organic brightness dips and thermal drift.
   - Perimeter noise on circle boundaries.

2. **Phase 2: Chromatic Shatter & Bit-Flip Spikes (`■■□` / 34% – 66%)**
   - *Inspiration*: Nam June Paik magnetic deflection & Rosa Menkman datamoshing.
   - **Color Glitching**: RGB channel splitting (e.g. cyan beams tearing into emerald and cobalt spikes, or inverting to complementary magenta).
   - Bit-crushed hue spikes (intermittent high-saturation flashframes in ultraviolet, searing crimson, electric lime).
   - Cluster dropouts (2–5 adjacent LEDs flickering in syncopated bursts).
   - Dynamic boundary jitter (circles micro-pulsing in radius).

3. **Phase 3: High-Frequency Stroboscopic Sublime (`■■■` / 67% – 100%)**
   - *Inspiration*: Ryoji Ikeda's *test pattern* & algorithmic stroboscopic sensory disorientation.
   - Machine-gun stroboscopic shuttering (scaling from 15 Hz up to 35–45 Hz at 100%).
   - Retinal after-image micro-blackouts.
   - Polychromatic strobe at top values: rapidly alternating between blinding white, blackout, and hyper-saturated primaries.

---

## Hardware Wiring Guide

### Components:
- **ELEGOO MEGA 2560** (or Arduino Mega 2560)
- **WS2812B Addressable 5V LED Strip**
- **5V DC External Power Supply** (calculate ~60mA per LED at full white, e.g. 5V 4A for 60-100 LEDs)
- **330Ω to 470Ω Resistor** (optional, recommended between Mega Pin 6 and WS2812B DIN)
- **1000µF 6.3V+ Capacitor** (optional, across 5V and GND near the strip)

### Schematic:
```
[External 5V Power Supply]
   (+) 5V  ───────────────────────────► WS2812B Strip +5V
   (-) GND ──────────┬────────────────► WS2812B Strip GND
                     │
                     ▼
[ELEGOO MEGA 2560]
   GND     ──────────┘ (COMMON GROUND IS ESSENTIAL)
   Pin 6   ─── [330Ω] ───────────────► WS2812B Strip DIN
   USB-B   ──────────────────────────► Computer USB Port
```

> [!IMPORTANT]
> Always connect the **GND** of the external 5V power supply to the **GND** of the ELEGOO Mega 2560 to establish a common ground reference.

---

## Flashing the Arduino Firmware

1. Open **Arduino IDE**.
2. Go to **Sketch > Include Library > Manage Libraries...** and search for **FastLED** by Daniel Garcia. Click **Install**.
3. Open `arduino/rcv_mega_controller/rcv_mega_controller.ino`.
4. Under **Tools > Board**, select **Arduino Mega or Mega 2560**.
5. Under **Tools > Port**, select the COM port for your ELEGOO Mega 2560.
6. Click **Upload** (`Ctrl + U`).
7. When uploaded, the board will quickly flash a dim green pulse on the first 5 LEDs to confirm initialization and output `RCV_MEGA_2026_READY` at 115200 baud.

---

## Running the Controller Server

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will print startup information:
```
============================================================
   REQUIEM CABARET VOLTAIRE 2026 - LED STAGE CONTROLLER   
============================================================
 > Local Computer:    http://localhost:3000
 > Phone / Wi-Fi URL: http://192.168.0.219:3000
 > Serial Status:     Connected (COM3) / Simulated
============================================================
```

### 3. Connect from Smartphone
1. Connect your phone to the same Wi-Fi network (or computer's Wi-Fi mobile hotspot).
2. Open the browser on your phone and navigate to `http://<WIFI_IP>:3000` (e.g. `http://192.168.0.219:3000`).
3. Rotate your phone to **Landscape** mode.
4. Enjoy real-time multi-touch control!

---

## UI Operation Manual

### Modifiers (Left Panel)
- **COLOR**: Vertical slider traversing the WS2812B spectrum (Vivid Red, Orange, Amber, Yellow, Lime, Cyber Green, Cyan, Cobalt, Violet, Magenta, Warm White, and **Pure White at the bottom max value**).
- **GLICH**: Vertical slider with 3-box indicator (`□□□`, `■□□`, `■■□`, `■■■`) controlling the 3 glitch regimes and strobe frequency.
- **SIZE**: Adjusts the radius of all selected circles (10% to 150%).

### Center Stage
- **Segments**:
  - Represent portions of the physical LED strip.
  - Endpoints show solid green circles when selected, hollow circles when unselected.
  - Drag endpoints or line bodies with your finger or mouse.
  - Interactive LED dots light up in real time when inside any active circle.
- **Circles**:
  - Influence zones affecting the LEDs of all intersecting or layered segments.
  - Solid border when selected, dotted border when unselected.
  - Drag circles across the stage with finger/mouse.

### Mapping Groups (Top Right)
- Displays active segments with Start and End LED indices (e.g. `AB 1 40`, `BC 41 80`).
- Tap segment row to select/deselect.
- Tap the numbers to edit the LED index range.
- Click `+` to add a new segment (`AB`, `BC`, `CD`...).

### Artistic Scenes Diamond Pad (Bottom Right)
- 8 artistic scene buttons in a diamond tessellation: `!`, `?`, `/`, `[`, `-`, `:`, `>`, `~`.
- **State Inheritance**: Switching to an unconfigured scene inherits the last active state. Once any element or modifier is changed, that scene branches into its own persistent state.
- Active scene button blinks and fades in dark red.

### Bottom Bar
- **Created Circles**: Badges `(A)`, `(B)`, `(C)`... Tap to select/deselect.
- **Predefined Circles**: 4 template slots (Teal, Dark Blue, Lime, Hollow Green). Tap to customize parameters, then tap the stage to place.
- **`(+)` Button**: Tap and click stage to place a default circle.
- **BORRAR ELEMENTO**: Deletes selected items (with confirmation modal).
- **APAGAR ELEMENTO**: Toggles selected items on/off (displays blinking `[OFF]` badge).
