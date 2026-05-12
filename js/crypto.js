const Crypto = {
  async _deriveKey(pin, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey', 'deriveBits']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  async encrypt(data, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._deriveKey(pin, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(data)
    );
    return {
      data: this._toBase64(new Uint8Array(encrypted)),
      salt: this._toBase64(salt),
      iv: this._toBase64(iv)
    };
  },

  async decrypt(stored, pin) {
    const salt = this._fromBase64(stored.salt);
    const iv = this._fromBase64(stored.iv);
    const data = this._fromBase64(stored.data);
    const key = await this._deriveKey(pin, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  },

  async hashPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return { hash: this._toBase64(new Uint8Array(bits)), salt: this._toBase64(salt) };
  },

  async verifyPin(pin, storedHash, storedSalt) {
    const salt = this._fromBase64(storedSalt);
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return this._toBase64(new Uint8Array(bits)) === storedHash;
  },

  _toBase64: bytes => btoa(String.fromCharCode(...bytes)),
  _fromBase64: str => Uint8Array.from(atob(str), c => c.charCodeAt(0))
};
