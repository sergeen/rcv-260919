# REQUIEM CABARET VOLTAIRE 2026 - CONTROLADOR DE ESCENARIO LED

Interfaz web táctil para móviles y puente de hardware para controlar tiras LED direccionables **WS2812B** con un **ELEGOO MEGA 2560** (o Arduino Mega 2560) mediante conexión serie USB.

---

## Concepto y Funcionamiento

*Requiem Cabaret Voltaire 2026* es un instrumento de iluminación en tiempo real para artes escénicas y audiovisuales. Convierte los gestos táctiles en un móvil en luz física con latencia ultra baja (~40 FPS).

### 1. Control Espacial Directo
- **Segmentos físicos**: Representan las tiras LED montadas en el espacio real, definidas en el lienzo 2D por sus índices de LED (`startLed` .. `endLed`).
- **Círculos de influencia**: En lugar de faders tradicionales, se colocan círculos interactivos en el escenario. Cualquier LED físico dentro de un círculo adopta su color, tamaño y efectos de glitch. Los círculos superpuestos se mezclan de forma aditiva.
- **Respuesta inmediata**: Al arrastrar un círculo con el dedo, la luz física se desplaza en el espacio sin retardo perceptible.

### 2. Motor de Glitch (3 Fases)
El control deslizante **GLICH** (0% a 100%) y su indicador (`□□□`) recorren tres etapas estéticas:

1. **Fase 1: Degradación analógica (`■□□` / 1%–33%)**
   - Microcortes esporádicos en LEDs individuales (1–2 fotogramas).
   - Caídas orgánicas de brillo que simulan caídas de tensión.
   - Ruido sutil en el perímetro de los círculos.
2. **Fase 2: Separación cromática y picos de color (`■■□` / 34%–66%)**
   - Ruptura de canales RGB (por ejemplo, destellos esmeralda o inversión a magenta).
   - Parpadeos repentinos de alta saturación en colores complementarios.
   - Microvariaciones rítmicas en el radio de los círculos.
3. **Fase 3: Estroboscópico de alta frecuencia (`■■■` / 67%–100%)**
   - Parpadeo tipo obturador que escala de 15 Hz hasta 45 Hz.
   - Alternancia rápida entre blanco cegador, apagón total y colores primarios puros.

### 3. Seguridad y Operación en Escenario
- **Bloqueo de segmentos (`LOCK`)**: Inmoviliza los segmentos LED para evitar moverlos o borrarlos por error mientras se manipulan los círculos durante la función.
- **Plantillas rápidas**: 4 ranuras predefinidas para ajustar parámetros y estampar círculos al instante en el escenario.
- **Servidor autoritativo**: Node.js calcula las colisiones geométricas y envía los fotogramas binarios al microcontrolador. Si el móvil suspende la pantalla o pierde Wi-Fi, la animación continúa sin interrumpirse.

---

## Arquitectura del Sistema

```
  ┌─────────────────────────────────────────────────────────┐
  │                 SMARTPHONE / NAVEGADOR                  │
  │   Interfaz táctil apaisada: Segmentos, Círculos, Escenas │
  └────────────────────────────┬────────────────────────────┘
                               │ Wi-Fi (WebSocket + HTTP)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               ORDENADOR (Servidor Node.js)              │
  │   - Servidor HTTP para la interfaz web                  │
  │   - WebSocket para sincronización en tiempo real        │
  │   - Persistencia de escenas (data/scenes_state.json)    │
  │   - Gestor serie USB (detección automática o simulación)│
  └────────────────────────────┬────────────────────────────┘
                               │ Serie USB (115200 Baud)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │           ELEGOO / ARDUINO MEGA 2560 (FastLED)          │
  │   - Protocolo binario de alta velocidad (0xAA 0x55 ...) │
  │   - Salida Pin 6 al DIN de la tira WS2812B              │
  └────────────────────────────┬────────────────────────────┘
                               │ Señal PWM
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               TIRA LED WS2812B (5V)                     │
  └─────────────────────────────────────────────────────────┘
```

---

## Conexión de Hardware

### Componentes necesarios:
- **ELEGOO Mega 2560** (o Arduino Mega 2560).
- **Tira LED WS2812B (5V)**.
- **Fuente de alimentación externa de 5V DC** (aprox. 60 mA por LED a blanco máximo; ej. 5V 4A para 60–100 LEDs).
- **Resistencia de 330Ω a 470Ω** (recomendada entre Pin 6 y DIN).
- **Condensador de 1000 µF / 6.3V+** (recomendado en paralelo entre 5V y GND de la tira).

### Esquema de conexionado:
```
[Fuente 5V Externa]
   (+) 5V  ───────────────────────────► Tira WS2812B (+5V)
   (-) GND ──────────┬────────────────► Tira WS2812B (GND)
                     │
                     ▼
[ELEGOO MEGA 2560]
   GND     ──────────┘ (MASA COMÚN OBLIGATORIA)
   Pin 6   ─── [330Ω] ───────────────► Tira WS2812B (DIN)
   USB-B   ──────────────────────────► Puerto USB del ordenador
```

> [!IMPORTANT]
> Es imprescindible conectar la masa (**GND**) de la fuente de 5V externa con el pin **GND** de la placa Mega 2560 para tener una masa común de referencia.

---

## Carga del Firmware en Arduino

1. Abre **Arduino IDE**.
2. Ve a **Programa > Incluir Librería > Administrar Bibliotecas...**, busca **FastLED** (por Daniel Garcia) e instálala.
3. Abre el archivo `arduino/rcv_mega_controller/rcv_mega_controller.ino`.
4. En **Herramientas > Placa**, selecciona **Arduino Mega or Mega 2560**.
5. En **Herramientas > Puerto**, selecciona el puerto COM de tu placa.
6. Pulsa **Subir** (`Ctrl + U`).
7. Al arrancar, los primeros 5 LEDs parpadearán en verde tenue y enviará `RCV_MEGA_2026_READY` por el puerto serie a 115200 baudios.

---

## Ejecución del Servidor

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar el servidor
```bash
npm start
```
El servidor mostrará en la terminal las direcciones de conexión:
```
============================================================
   REQUIEM CABARET VOLTAIRE 2026 - LED STAGE CONTROLLER   
============================================================
 > Ordenador Local:    http://localhost:3000
 > Teléfono / Wi-Fi:   http://192.168.0.219:3000
 > Estado Serie:       Conectado (COM3) / Simulado
============================================================
```

### 3. Conexión desde el móvil
1. Conecta el teléfono a la misma red Wi-Fi (o a la zona Wi-Fi creada por el ordenador).
2. Abre el navegador del móvil y entra a `http://<IP_WIFI>:3000` (ejemplo: `http://192.168.0.219:3000`).
3. Gira el móvil a posición **horizontal (landscape)**.

---

## Guía de la Interfaz

### Modificadores (Panel Izquierdo)
- **COLOR**: Deslizador vertical que recorre el espectro (rojo, naranja, ámbar, amarillo, lima, verde neón, cian, azul cobalto, violeta, magenta, blanco cálido y **blanco puro al final**).
- **GLICH**: Deslizador vertical con indicador de 3 fases (`□□□` a `■■■`) para controlar la intensidad del fallo visual y frecuencia estroboscópica.
- **SIZE**: Modifica el radio de los círculos seleccionados (10% a 150%).

### Escenario Central
- **Segmentos**:
  - Representan tramos físicos de la tira LED.
  - Los extremos se muestran en verde sólido al seleccionarse o con círculo hueco al deseleccionarse.
  - Arrastra los extremos o el cuerpo de la línea con el dedo o ratón.
  - Los puntos LED interactivos se iluminan en tiempo real cuando quedan dentro de un círculo activo.
- **Círculos**:
  - Zonas de influencia sobre los LEDs que quedan dentro de su área.
  - Borde sólido al estar seleccionados y borde punteado al no estarlo.
  - Arrastrables por el lienzo.

### Mapeo de Segmentos (Arriba a la Derecha)
- Muestra la lista de segmentos con sus índices inicial y final (ej. `AB 1 40`, `BC 41 80`).
- Toca una fila para seleccionarla.
- Toca los números para editar el rango de LEDs.
- Pulsa `+` para añadir un nuevo segmento (`AB`, `BC`, `CD`...).

### Panel de Escenas en Rombo (Abajo a la Derecha)
- 8 botones de escenas dispuestos en rombo: `!`, `?`, `/`, `[`, `-`, `:`, `>`, `~`.
- **Herencia de estado**: Al cambiar a una escena no configurada, hereda la última escena activa. En cuanto modificas un elemento, esa escena guarda su propio estado independiente.
- La escena activa parpadea en rojo oscuro.

### Barra Inferior
- **Círculos Creados**: Botones con etiquetas `(A)`, `(B)`, `(C)`... Tócalos para seleccionarlos o deseleccionarlos.
- **Plantillas Predefinidas**: 4 ranuras rápidas para cambiar valores y pulsar sobre el lienzo para añadir.
- **Botón `(+)`**: Añade un círculo estándar en el escenario.
- **APAGAR ELEMENTO**: Activa/desactiva los elementos seleccionados (muestra indicador parpadeante `[OFF]`).
- **BORRAR ELEMENTO**: Elimina los elementos seleccionados (con confirmación).
