// AudioWorkletProcessor

class PCM16FrameProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.frameSize = opts.frameSize || 320; // 20 ms @ 16kHz
    this._buf = new Float32Array(0);
  }

  // Append Float32 chunk to internal buffer
  _appendFloat32(chunk) {
    if (!chunk || chunk.length === 0) return;
    const merged = new Float32Array(this._buf.length + chunk.length);
    merged.set(this._buf, 0);
    merged.set(chunk, this._buf.length);
    this._buf = merged;
  }

  _drainFrames() {
    while (this._buf.length >= this.frameSize) {
      const frameF32 = this._buf.subarray(0, this.frameSize);
      this._buf = this._buf.subarray(this.frameSize);

      // Float32 [-1, 1] -> Int16 PCM
      const frameI16 = new Int16Array(this.frameSize);
      for (let i = 0; i < this.frameSize; i++) {
        let s = frameF32[i];
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        frameI16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const ab = frameI16.buffer;
      this.port.postMessage(ab, [ab]);
    }
  }

  process(inputs) {
    const input = inputs && inputs[0];
    if (!input || input.length === 0) return true;

    const ch0 = input[0];
    this._appendFloat32(ch0);
    this._drainFrames();
    return true; // keep processor alive
  }
}

registerProcessor("pcm16-frames", PCM16FrameProcessor);
