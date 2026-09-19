const EventEmitter = require('events');
let SerialPort = null;

try {
  const serialModule = require('serialport');
  SerialPort = serialModule.SerialPort;
} catch (e) {
  console.warn('[SerialManager] serialport module not available, running in virtual mode:', e.message);
}

class SerialManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baudRate = options.baudRate || 250000;
    this.autoConnect = options.autoConnect !== false;
    this.port = null;
    this.portPath = options.portPath || null;
    this.isConnected = false;
    this.isSimulated = true;
    this.isSending = false;
    this.pendingFrame = null;
    this.scanInterval = null;

    // Statistics
    this.stats = {
      framesSent: 0,
      bytesSent: 0,
      fps: 0,
      lastFrameTime: Date.now(),
      fpsCounter: 0,
      lastFpsUpdate: Date.now()
    };

    // FPS computation loop
    setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.stats.lastFpsUpdate) / 1000;
      if (elapsed >= 1) {
        this.stats.fps = Math.round(this.stats.fpsCounter / elapsed);
        this.stats.fpsCounter = 0;
        this.stats.lastFpsUpdate = now;
      }
    }, 1000);

    if (this.autoConnect) {
      this.startScanning();
    }
  }

  async listAvailablePorts() {
    if (!SerialPort) return [];
    try {
      return await SerialPort.list();
    } catch (err) {
      console.error('[SerialManager] Error listing ports:', err.message);
      return [];
    }
  }

  startScanning() {
    if (this.scanInterval) return;
    this.scanInterval = setInterval(async () => {
      if (!this.isConnected) {
        await this.autoDetectAndConnect();
      }
    }, 3000);
    this.autoDetectAndConnect();
  }

  stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  async autoDetectAndConnect() {
    if (!SerialPort || this.isConnected) return;
    const ports = await this.listAvailablePorts();
    if (ports.length === 0) {
      return;
    }

    // Look for Arduino Mega 2560 or ELEGOO or CH340 or specified path
    let targetPort = null;
    if (this.portPath) {
      targetPort = ports.find(p => p.path === this.portPath);
    }

    if (!targetPort) {
      // Find by manufacturer or description or USB IDs
      targetPort = ports.find(p => {
        const desc = (p.friendlyName || p.manufacturer || p.description || '').toLowerCase();
        return (
          desc.includes('mega') ||
          desc.includes('elegoo') ||
          desc.includes('arduino') ||
          desc.includes('ch340') ||
          desc.includes('usb-serial') ||
          p.vendorId === '2341' ||
          p.vendorId === '1a86'
        );
      });
    }

    // Fallback: if only 1 COM port exists, pick it
    if (!targetPort && ports.length === 1) {
      targetPort = ports[0];
    }

    if (targetPort) {
      console.log(`[SerialManager] Detected potential hardware port: ${targetPort.path} (${targetPort.manufacturer || targetPort.friendlyName || 'Unknown'})`);
      this.connect(targetPort.path);
    }
  }

  connect(path) {
    if (!SerialPort) return false;
    if (this.port && this.port.isOpen) {
      try { this.port.close(); } catch (e) {}
    }

    this.portPath = path;
    console.log(`[SerialManager] Connecting to ${path} at ${this.baudRate} baud...`);

    try {
      this.port = new SerialPort({
        path: path,
        baudRate: this.baudRate,
        autoOpen: true
      });

      this.port.on('open', () => {
        this.isConnected = true;
        this.isSimulated = false;
        console.log(`[SerialManager] Connected to ${path}`);
        this.emit('status', {
          connected: true,
          simulated: false,
          port: path,
          baudRate: this.baudRate
        });
      });

      this.port.on('data', (data) => {
        this.emit('data', data);
      });

      this.port.on('error', (err) => {
        console.error(`[SerialManager] Port error on ${path}:`, err.message);
        this.emit('error', err);
      });

      this.port.on('close', () => {
        console.log(`[SerialManager] Port closed on ${path}`);
        this.isConnected = false;
        this.isSimulated = true;
        this.emit('status', {
          connected: false,
          simulated: true,
          port: null,
          baudRate: this.baudRate
        });
      });

      return true;
    } catch (err) {
      console.error(`[SerialManager] Failed to create port on ${path}:`, err.message);
      this.isConnected = false;
      this.isSimulated = true;
      return false;
    }
  }

  disconnect() {
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.isConnected = false;
    this.isSimulated = true;
  }

  /**
   * Send a binary frame of RGB data to the WS2812B strip.
   * rgbBuffer: Uint8Array or Buffer containing [R0, G0, B0, R1, G1, B1, ...]
   */
  sendLedFrame(rgbBuffer) {
    if (!rgbBuffer || rgbBuffer.length === 0) return;

    // Maintain stats
    this.stats.framesSent++;
    this.stats.fpsCounter++;
    this.stats.bytesSent += rgbBuffer.length;
    this.stats.lastFrameTime = Date.now();

    if (!this.isConnected || !this.port || !this.port.isOpen) {
      // Virtual/simulated mode: acknowledge smoothly without blocking
      return;
    }

    if (this.isSending) {
      // Drop frame or queue only latest frame to avoid buffer buildup
      this.pendingFrame = rgbBuffer;
      return;
    }

    this._writeFramePacket(rgbBuffer);
  }

  _writeFramePacket(rgbBuffer) {
    this.isSending = true;
    const numBytes = rgbBuffer.length;
    // Protocol: SYNC1 (0xAA), SYNC2 (0x55), CMD (0x01), LEN_HI, LEN_LO, PAYLOAD, CHECKSUM
    const packet = Buffer.alloc(5 + numBytes + 1);
    packet[0] = 0xAA;
    packet[1] = 0x55;
    packet[2] = 0x01; // CMD_SET_FRAME
    packet[3] = (numBytes >> 8) & 0xFF;
    packet[4] = numBytes & 0xFF;

    let checksum = packet[2] ^ packet[3] ^ packet[4];

    for (let i = 0; i < numBytes; i++) {
      const byteVal = rgbBuffer[i];
      packet[5 + i] = byteVal;
      checksum ^= byteVal;
    }

    packet[5 + numBytes] = checksum;

    this.port.write(packet, (err) => {
      if (err) {
        this.isSending = false;
        console.error('[SerialManager] Write error:', err.message);
        if (this.pendingFrame) {
          const next = this.pendingFrame;
          this.pendingFrame = null;
          this._writeFramePacket(next);
        }
        return;
      }

      // Wait until physical transmission completes before sending next frame
      if (typeof this.port.drain === 'function') {
        this.port.drain(() => {
          this.isSending = false;
          if (this.pendingFrame) {
            const next = this.pendingFrame;
            this.pendingFrame = null;
            this._writeFramePacket(next);
          }
        });
      } else {
        this.isSending = false;
        if (this.pendingFrame) {
          const next = this.pendingFrame;
          this.pendingFrame = null;
          this._writeFramePacket(next);
        }
      }
    });
  }

  getStatus() {
    return {
      connected: this.isConnected,
      simulated: this.isSimulated,
      port: this.portPath,
      baudRate: this.baudRate,
      stats: this.stats
    };
  }
}

module.exports = SerialManager;
