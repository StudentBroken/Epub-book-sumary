/**
 * ESP32-S3 E-Reader Bluetooth Low Energy (BLE) & Web Serial Device Manager
 * Implements wireless synchronization, LittleFS library management, and OTA updates.
 * Matching firmware protocol in include/ble_sync_manager.h.
 */

export const BLE_CONFIG = {
  SERVICE_UUID:   '19b10000-e8f2-537e-4f6c-d104768a1214',
  CHAR_CTRL_UUID: '19b10001-e8f2-537e-4f6c-d104768a1214',
  CHAR_DATA_UUID: '19b10002-e8f2-537e-4f6c-d104768a1214'
};

export const BLE_CMD = {
  START_TRANSFER:  0x01,
  FINISH_TRANSFER: 0x02,
  ABORT:           0x03,
  LIST_BOOKS:      0x04,
  DELETE_BOOK:     0x05,
  RENAME_BOOK:     0x06,
  SELECT_BOOK:     0x07,
  START_OTA:       0x10,
  FINISH_OTA:      0x11,
  ABORT_OTA:       0x12
};

export const BLE_STATUS = {
  IDLE:      0x00,
  READY:     0x01,
  SUCCESS:   0x02,
  ERROR:     0x03,
  ABORTED:   0x04,
  BOOK_LIST: 0x05
};

class BleDeviceManager {
  constructor() {
    this.activeMode = 'ble'; // 'ble' or 'serial'
    this.bleDevice = null;
    this.bleServer = null;
    this.bleCtrlChar = null;
    this.bleDataChar = null;

    this.serialPort = null;
    this.serialReader = null;
    this.serialWriter = null;

    this.isTransferring = false;
    this.isFlashingOta = false;

    this.libraryData = null; // { total, used, free, books: [], active: '' }
    this.bookListChunksBuffer = '';

    this.bleReadyResolver = null;
    this.bleFinishResolver = null;
    this.pendingOpResolver = null;

    this.listeners = {
      stateChange: [],
      log: [],
      libraryUpdate: [],
      progress: []
    };
  }

  // ================= EVENT SUBSCRIPTION =================

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(...args); } catch (err) { console.error(`[BleManager Listener Error]`, err); }
      });
    }
  }

  log(message, color = '') {
    const timestamp = new Date().toLocaleTimeString();
    this.emit('log', { message: `[${timestamp}] ${message}`, color, rawMessage: message });
  }

  isConnected() {
    if (this.activeMode === 'ble') {
      return !!(this.bleServer && this.bleServer.connected);
    }
    return !!(this.serialPort && this.serialPort.readable);
  }

  getConnectionType() {
    if (this.bleServer && this.bleServer.connected) return 'ble';
    if (this.serialPort && this.serialPort.readable) return 'serial';
    return 'none';
  }

  // ================= WEB BLUETOOTH (BLE) =================

  async connectBLE() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, Opera, or Bluefy (iOS).');
    }

    this.activeMode = 'ble';
    this.log('[BLE] Requesting Bluetooth device with name "ESP32-Ereader"...');

    this.bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'ESP32-Ereader' }],
      optionalServices: [BLE_CONFIG.SERVICE_UUID]
    });

    this.bleDevice.addEventListener('gattserverdisconnected', () => this.onBleDisconnected());

    this.log('[BLE] Device selected! Connecting to GATT server...');
    this.bleServer = await this.bleDevice.gatt.connect();

    this.log('[BLE] Connected! Locating E-Reader service...');
    const service = await this.bleServer.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

    this.log('[BLE] Getting control and data characteristics...');
    this.bleCtrlChar = await service.getCharacteristic(BLE_CONFIG.CHAR_CTRL_UUID);
    this.bleDataChar = await service.getCharacteristic(BLE_CONFIG.CHAR_DATA_UUID);

    await this.bleCtrlChar.startNotifications();
    this.bleCtrlChar.addEventListener('characteristicvaluechanged', (e) => this.onBleNotification(e));

    this.log('[BLE] Ready! Paired successfully with ESP32-Ereader.', '#10b981');
    this.emit('stateChange', { connected: true, type: 'ble' });

    // Automatically request stored library from e-reader
    setTimeout(() => this.requestBookList(), 350);
    return true;
  }

  disconnectBLE() {
    if (this.bleDevice && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
    }
  }

  onBleDisconnected() {
    this.log('[BLE] Disconnected from E-Reader.', '#f59e0b');
    this.bleServer = null;
    this.bleCtrlChar = null;
    this.bleDataChar = null;
    this.libraryData = null;
    this.emit('stateChange', { connected: false, type: 'none' });
    this.emit('libraryUpdate', null);
  }

  onBleNotification(event) {
    const val = event.target.value;
    if (val.byteLength < 1) return;
    const status = val.getUint8(0);

    if (status === BLE_STATUS.READY) {
      this.log('[BLE] E-Reader is READY for data stream.', '#10b981');
      if (this.bleReadyResolver) {
        this.bleReadyResolver();
        this.bleReadyResolver = null;
      }
    } else if (status === BLE_STATUS.SUCCESS) {
      this.log('[BLE SUCCESS] Operation confirmed by E-Reader.', '#10b981');
      if (this.bleFinishResolver) {
        this.bleFinishResolver({ success: true });
        this.bleFinishResolver = null;
      }
      if (this.pendingOpResolver) {
        this.pendingOpResolver({ success: true });
        this.pendingOpResolver = null;
      }
    } else if (status === BLE_STATUS.ERROR) {
      this.log('[BLE ERR] E-Reader reported an error!', '#ef4444');
      if (this.bleFinishResolver) {
        this.bleFinishResolver({ success: false, reason: 'E-Reader reported storage or write error' });
        this.bleFinishResolver = null;
      }
      if (this.pendingOpResolver) {
        this.pendingOpResolver({ success: false, reason: 'Operation failed on E-Reader' });
        this.pendingOpResolver = null;
      }
    } else if (status === BLE_STATUS.ABORTED) {
      this.log('[BLE] Operation was aborted.', '#f59e0b');
      if (this.bleFinishResolver) {
        this.bleFinishResolver({ success: false, reason: 'Operation was aborted' });
        this.bleFinishResolver = null;
      }
      if (this.pendingOpResolver) {
        this.pendingOpResolver({ success: false, reason: 'Aborted' });
        this.pendingOpResolver = null;
      }
    } else if (status === BLE_STATUS.BOOK_LIST) {
      // Byte 1: has_more (1 = more chunks coming, 0 = final chunk)
      // Bytes 2..N: JSON text slice
      const hasMore = val.getUint8(1);
      const sliceBytes = new Uint8Array(val.buffer, val.byteOffset + 2, val.byteLength - 2);
      const sliceText = new TextDecoder().decode(sliceBytes);
      this.bookListChunksBuffer += sliceText;

      if (hasMore === 0) {
        try {
          const data = JSON.parse(this.bookListChunksBuffer);
          this.libraryData = data;
          this.emit('libraryUpdate', data);
          this.log(`[BLE] Loaded ${data.books ? data.books.length : 0} book(s) from device library.`);
        } catch (err) {
          this.log('[BLE ERR] Failed to parse library JSON: ' + err.message, '#ef4444');
        } finally {
          this.bookListChunksBuffer = '';
        }
      }
    }
  }

  // ================= DEVICE BOOK MANAGEMENT =================

  async requestBookList() {
    if (!this.bleCtrlChar || !this.bleServer || !this.bleServer.connected) {
      throw new Error('Please connect to the E-Reader over BLE first.');
    }
    try {
      this.bookListChunksBuffer = '';
      this.log('[BLE] Requesting library & storage info from E-Reader...');
      const packet = new Uint8Array([BLE_CMD.LIST_BOOKS]);
      await this.bleCtrlChar.writeValue(packet);
    } catch (err) {
      this.log('[BLE ERR] Failed to request library: ' + err.message, '#ef4444');
      throw err;
    }
  }

  async selectActiveBook(filename) {
    if (!this.bleCtrlChar || !this.bleServer || !this.bleServer.connected) {
      throw new Error('Please connect to the E-Reader over BLE first.');
    }
    try {
      this.log(`[BLE] Switching active book on E-Reader to '${filename}'...`);
      const enc = new TextEncoder();
      const fnameBytes = enc.encode(filename);
      const packet = new Uint8Array(1 + fnameBytes.length);
      packet[0] = BLE_CMD.SELECT_BOOK;
      packet.set(fnameBytes, 1);

      const opPromise = new Promise((resolve, reject) => {
        this.pendingOpResolver = resolve;
        setTimeout(() => reject(new Error('Timeout waiting for switch confirmation')), 5000);
      });

      await this.bleCtrlChar.writeValue(packet);
      const res = await opPromise;
      if (res && res.success) {
        this.log(`[BLE SUCCESS] E-Reader switched to '${filename}'!`, '#10b981');
        setTimeout(() => this.requestBookList(), 350);
        return true;
      }
      throw new Error(res ? res.reason : 'Failed to switch book');
    } catch (err) {
      this.log('[BLE ERR] Select book error: ' + err.message, '#ef4444');
      throw err;
    }
  }

  async renameBook(oldFilename, newFilename) {
    if (!this.bleCtrlChar || !this.bleServer || !this.bleServer.connected) {
      throw new Error('Please connect to the E-Reader over BLE first.');
    }

    const cleanOld = oldFilename.startsWith('/') ? oldFilename.substring(1) : oldFilename;
    let targetNew = newFilename.trim();
    if (!targetNew.toLowerCase().endsWith('.ebk')) {
      targetNew += '.ebk';
    }

    try {
      this.log(`[BLE] Renaming '${cleanOld}' -> '${targetNew}' on E-Reader...`);
      const enc = new TextEncoder();
      const oldBytes = enc.encode(cleanOld);
      const newBytes = enc.encode(targetNew);

      // Packet: [CMD_RENAME_BOOK (0x06)][uint8 old_len][old_bytes][new_bytes]
      const packet = new Uint8Array(2 + oldBytes.length + newBytes.length);
      packet[0] = BLE_CMD.RENAME_BOOK;
      packet[1] = oldBytes.length;
      packet.set(oldBytes, 2);
      packet.set(newBytes, 2 + oldBytes.length);

      const opPromise = new Promise((resolve, reject) => {
        this.pendingOpResolver = resolve;
        setTimeout(() => reject(new Error('Timeout waiting for rename confirmation')), 5000);
      });

      await this.bleCtrlChar.writeValue(packet);
      const res = await opPromise;
      if (res && res.success) {
        this.log(`[BLE SUCCESS] Book renamed to '${targetNew}'!`, '#10b981');
        setTimeout(() => this.requestBookList(), 350);
        return true;
      }
      throw new Error(res ? res.reason : 'Failed to rename book');
    } catch (err) {
      this.log('[BLE ERR] Rename book error: ' + err.message, '#ef4444');
      throw err;
    }
  }

  async deleteBook(filename) {
    if (!this.bleCtrlChar || !this.bleServer || !this.bleServer.connected) {
      throw new Error('Please connect to the E-Reader over BLE first.');
    }

    const cleanName = filename.startsWith('/') ? filename.substring(1) : filename;

    try {
      this.log(`[BLE] Deleting '${cleanName}' from E-Reader storage...`);
      const enc = new TextEncoder();
      const fnameBytes = enc.encode(cleanName);
      const packet = new Uint8Array(1 + fnameBytes.length);
      packet[0] = BLE_CMD.DELETE_BOOK;
      packet.set(fnameBytes, 1);

      const opPromise = new Promise((resolve, reject) => {
        this.pendingOpResolver = resolve;
        setTimeout(() => reject(new Error('Timeout waiting for delete confirmation')), 5000);
      });

      await this.bleCtrlChar.writeValue(packet);
      const res = await opPromise;
      if (res && res.success) {
        this.log(`[BLE SUCCESS] '${cleanName}' deleted from E-Reader!`, '#10b981');
        setTimeout(() => this.requestBookList(), 350);
        return true;
      }
      throw new Error(res ? res.reason : 'Failed to delete book');
    } catch (err) {
      this.log('[BLE ERR] Delete book error: ' + err.message, '#ef4444');
      throw err;
    }
  }

  // ================= BOOK STREAMING (BLE) =================

  async uploadBookBLE(fileOrBytes, filename = 'book.ebk', onProgress) {
    if (!this.bleServer || !this.bleServer.connected || !this.bleCtrlChar || !this.bleDataChar) {
      throw new Error('Please connect to the E-Reader over BLE first!');
    }

    this.isTransferring = true;
    this.emit('progress', { type: 'book', status: 'Waiting for E-Reader to prepare storage...', pct: 0 });

    try {
      let fileBytes;
      if (fileOrBytes instanceof Uint8Array) {
        fileBytes = fileOrBytes;
      } else if (fileOrBytes instanceof ArrayBuffer) {
        fileBytes = new Uint8Array(fileOrBytes);
      } else if (fileOrBytes && typeof fileOrBytes.arrayBuffer === 'function') {
        const ab = await fileOrBytes.arrayBuffer();
        fileBytes = new Uint8Array(ab);
      } else {
        throw new Error('Invalid file format provided for BLE streaming.');
      }

      const fileSize = fileBytes.length;
      const safeFilename = (filename || 'book.ebk').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const finalFilename = safeFilename.endsWith('.ebk') ? safeFilename : `${safeFilename}.ebk`;

      this.log(`[BLE] Initializing transfer for '${finalFilename}' (${(fileSize / 1024).toFixed(1)} KB)...`);

      // Prepare promise for STATUS_READY (0x01)
      const readyPromise = new Promise((resolve, reject) => {
        this.bleReadyResolver = resolve;
        setTimeout(() => reject(new Error('Timeout waiting for E-Reader READY handshake')), 6000);
      });

      // Prepare CMD_START_TRANSFER packet:
      // Byte 0: 0x01, Bytes 1..4: uint32_t fileSize (LE), Bytes 5..N: finalFilename UTF-8
      const encoder = new TextEncoder();
      const nameBytes = encoder.encode(finalFilename);
      const startPacket = new Uint8Array(5 + nameBytes.length);
      startPacket[0] = BLE_CMD.START_TRANSFER;

      const view = new DataView(startPacket.buffer);
      view.setUint32(1, fileSize, true); // Little-endian
      startPacket.set(nameBytes, 5);

      await this.bleCtrlChar.writeValue(startPacket);
      await readyPromise;

      this.log('[BLE] E-Reader confirmed ready. Streaming with flow-controlled write-response...');

      const chunkSize = 256;
      let offset = 0;
      const startTime = Date.now();

      const finishPromise = new Promise((resolve) => {
        this.bleFinishResolver = resolve;
      });

      while (offset < fileSize) {
        const chunk = fileBytes.slice(offset, offset + chunkSize);
        if (this.bleDataChar.writeValueWithResponse) {
          await this.bleDataChar.writeValueWithResponse(chunk);
        } else {
          await this.bleDataChar.writeValue(chunk);
        }
        offset += chunk.length;

        const pct = Math.floor((offset / fileSize) * 100);
        const statusText = `Streaming ${(offset / 1024).toFixed(1)} / ${(fileSize / 1024).toFixed(1)} KB (${pct}%)`;
        this.emit('progress', { type: 'book', status: statusText, pct, sent: offset, total: fileSize });
        if (onProgress) onProgress(pct, offset, fileSize);
      }

      this.log('[BLE] Streamed 100% of bytes. Finalizing and verifying with E-Reader...');
      this.emit('progress', { type: 'book', status: 'Verifying with E-Reader...', pct: 100, sent: fileSize, total: fileSize });

      const finishPacket = new Uint8Array([BLE_CMD.FINISH_TRANSFER]);
      await this.bleCtrlChar.writeValue(finishPacket);

      const result = await finishPromise;
      if (result && result.success) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = duration > 0 ? ((fileSize / 1024) / duration).toFixed(1) : '0';
        this.log(`[BLE SUCCESS] Book '${finalFilename}' verified and saved in ${duration}s (${rate} KB/s)!`, '#10b981');
        this.emit('progress', { type: 'book', status: 'Complete! E-Reader is opening book.', pct: 100 });
        setTimeout(() => this.requestBookList(), 600);
        return { success: true, filename: finalFilename, bytes: fileSize };
      }
      throw new Error(result ? result.reason : 'E-Reader rejected the transfer');
    } catch (err) {
      this.log('[BLE ERR] Transfer failed: ' + err.message, '#ef4444');
      throw err;
    } finally {
      this.isTransferring = false;
      this.bleReadyResolver = null;
      this.bleFinishResolver = null;
    }
  }

  // ================= WIRELESS FIRMWARE OTA (BLE) =================

  async flashFirmwareBLE(fileOrBytes, filename = 'firmware.bin', onProgress) {
    if (!this.bleServer || !this.bleServer.connected || !this.bleCtrlChar || !this.bleDataChar) {
      throw new Error('Please connect to the E-Reader over BLE first!');
    }

    this.isFlashingOta = true;
    this.emit('progress', { type: 'ota', status: 'Initializing OTA on E-Reader...', pct: 0 });

    try {
      let fileBytes;
      if (fileOrBytes instanceof Uint8Array) {
        fileBytes = fileOrBytes;
      } else if (fileOrBytes instanceof ArrayBuffer) {
        fileBytes = new Uint8Array(fileOrBytes);
      } else if (fileOrBytes && typeof fileOrBytes.arrayBuffer === 'function') {
        const ab = await fileOrBytes.arrayBuffer();
        fileBytes = new Uint8Array(ab);
      } else {
        throw new Error('Invalid binary format provided for OTA flash.');
      }

      const fileSize = fileBytes.length;
      if (fileSize > 1835008) {
        throw new Error(`File too large for OTA partition! Size: ${(fileSize / 1024).toFixed(0)} KB (max 1792 KB).`);
      }

      this.log(`[BLE OTA] Sending OTA init packet for '${filename}' (${fileSize.toLocaleString()} bytes)...`, '#c084fc');

      const readyPromise = new Promise((resolve, reject) => {
        this.bleReadyResolver = resolve;
        setTimeout(() => reject(new Error('Timeout waiting for E-Reader OTA READY handshake')), 6000);
      });

      // Prepare CMD_START_OTA packet: [0x10][uint32 fileSize LE]
      const startPacket = new Uint8Array(5);
      startPacket[0] = BLE_CMD.START_OTA;
      const view = new DataView(startPacket.buffer);
      view.setUint32(1, fileSize, true);

      await this.bleCtrlChar.writeValue(startPacket);
      await readyPromise;

      this.log('[BLE OTA] E-Reader initialized OTA partition. Streaming firmware chunks...', '#10b981');

      const chunkSize = 256;
      let offset = 0;
      const startTime = Date.now();

      const finishPromise = new Promise((resolve) => {
        this.bleFinishResolver = resolve;
      });

      while (offset < fileSize) {
        const chunk = fileBytes.slice(offset, offset + chunkSize);
        if (this.bleDataChar.writeValueWithResponse) {
          await this.bleDataChar.writeValueWithResponse(chunk);
        } else {
          await this.bleDataChar.writeValue(chunk);
        }
        offset += chunk.length;

        const pct = Math.floor((offset / fileSize) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = elapsed > 0 ? ((offset / 1024) / elapsed).toFixed(1) : '0';
        const statusText = `Flashing ${(offset / 1024).toFixed(0)} / ${(fileSize / 1024).toFixed(0)} KB (${rate} KB/s)`;
        this.emit('progress', { type: 'ota', status: statusText, pct, sent: offset, total: fileSize });
        if (onProgress) onProgress(pct, offset, fileSize);
      }

      this.log('[BLE OTA] Streamed 100% of firmware. Finalizing & verifying checksum...', '#c084fc');
      this.emit('progress', { type: 'ota', status: 'Verifying checksum & committing partition...', pct: 100 });

      const finishPacket = new Uint8Array([BLE_CMD.FINISH_OTA]);
      await this.bleCtrlChar.writeValue(finishPacket);

      const result = await finishPromise;
      if (result && result.success) {
        const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
        this.log(`[BLE OTA SUCCESS] Firmware updated in ${totalSec}s! E-Reader is rebooting into the new build...`, '#10b981');
        this.emit('progress', { type: 'ota', status: 'OTA Flash Complete! E-Reader is rebooting...', pct: 100 });
        return { success: true, duration: totalSec };
      }
      throw new Error(result ? result.reason : 'E-Reader rejected OTA update');
    } catch (err) {
      this.log('[BLE OTA ERR] OTA update failed: ' + err.message, '#ef4444');
      throw err;
    } finally {
      this.isFlashingOta = false;
      this.bleReadyResolver = null;
      this.bleFinishResolver = null;
    }
  }

  // ================= WEB SERIAL (USB-C) =================

  async connectSerial() {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is only supported in Chrome, Edge, and Opera browsers over HTTPS or localhost.');
    }

    this.activeMode = 'serial';
    this.log('[SERIAL] Requesting USB Serial Port (CDC Modem)...');
    this.serialPort = await navigator.serial.requestPort();
    await this.serialPort.open({ baudRate: 115200 });

    this.log('[SERIAL] Connected to XIAO ESP32-S3 USB Serial Port.', '#10b981');
    this.emit('stateChange', { connected: true, type: 'serial' });

    this.readSerialStream();
    return true;
  }

  async disconnectSerial() {
    try {
      if (this.serialReader) {
        await this.serialReader.cancel();
        this.serialReader = null;
      }
      if (this.serialPort) {
        await this.serialPort.close();
        this.serialPort = null;
      }
      this.log('[SERIAL] Disconnected from serial port.');
      this.emit('stateChange', { connected: false, type: 'none' });
    } catch (err) {
      this.log('[SERIAL ERR] Disconnect error: ' + err.message, '#ef4444');
    }
  }

  async readSerialStream() {
    if (!this.serialPort || !this.serialPort.readable) return;
    const textDecoder = new TextDecoderStream();
    this.serialPort.readable.pipeTo(textDecoder.writable).catch(() => {});
    this.serialReader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        if (value) {
          this.log(value);
        }
      }
    } catch (err) {
      this.log('[SERIAL ERR] Stream read error: ' + err.message, '#ef4444');
    } finally {
      if (this.serialReader) {
        try { this.serialReader.releaseLock(); } catch (_) {}
      }
    }
  }

  async uploadBookSerial(fileOrBytes, onProgress) {
    if (!this.serialPort || !this.serialPort.writable) {
      throw new Error('Please connect USB Serial first!');
    }

    this.isTransferring = true;
    this.emit('progress', { type: 'book', status: 'Streaming via USB-C...', pct: 0 });

    try {
      let bytes;
      if (fileOrBytes instanceof Uint8Array) {
        bytes = fileOrBytes;
      } else if (fileOrBytes && typeof fileOrBytes.arrayBuffer === 'function') {
        const ab = await fileOrBytes.arrayBuffer();
        bytes = new Uint8Array(ab);
      } else {
        throw new Error('Invalid file bytes for serial upload.');
      }

      const chunkSize = 256;
      let offset = 0;

      this.serialWriter = this.serialPort.writable.getWriter();
      while (offset < bytes.length) {
        const chunk = bytes.slice(offset, offset + chunkSize);
        await this.serialWriter.write(chunk);
        offset += chunk.length;

        const pct = Math.floor((offset / bytes.length) * 100);
        this.emit('progress', { type: 'book', status: `Streaming: ${Math.round(offset / 1024)} / ${Math.round(bytes.length / 1024)} KB (${pct}%)`, pct, sent: offset, total: bytes.length });
        if (onProgress) onProgress(pct, offset, bytes.length);

        await new Promise(r => setTimeout(r, 8));
      }

      this.log(`[SERIAL SUCCESS] Streamed ${bytes.length} bytes to USB serial!`, '#10b981');
      this.emit('progress', { type: 'book', status: 'Upload Finished!', pct: 100 });
      return { success: true, bytes: bytes.length };
    } catch (err) {
      this.log('[SERIAL ERR] Upload failed: ' + err.message, '#ef4444');
      throw err;
    } finally {
      if (this.serialWriter) {
        try { this.serialWriter.releaseLock(); } catch (_) {}
        this.serialWriter = null;
      }
      this.isTransferring = false;
    }
  }
}

// Global singleton instance for entire application
export const bleDeviceManager = new BleDeviceManager();
