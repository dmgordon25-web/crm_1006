(function () {
  if (window.__WIRED_nonePartnerUuid) return;
  window.__WIRED_nonePartnerUuid = true;

  // Namespace UUID (v5) based on a fixed DNS namespace + constant name.
  // Lightweight v5 impl (SHA-1) to avoid deps.
  function sha1hex(bytes) {
    return crypto.subtle
      .digest("SHA-1", bytes)
      .then((b) =>
        Array.from(new Uint8Array(b))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
      );
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (Array.isArray(value)) return new Uint8Array(value);
    throw new TypeError("Expected string, array, or byte buffer");
  }

  function uuidStringToBytes(uuid) {
    return new Uint8Array(
      uuid
        .replace(/-/g, "")
        .match(/.{1,2}/g)
        .map((h) => parseInt(h, 16))
    );
  }

  async function uuidv5(name, ns) {
    const nsBytes = typeof ns === "string" ? uuidStringToBytes(ns) : toBytes(ns);
    const nameBytes = toBytes(name);
    const bytes = new Uint8Array(nsBytes.length + nameBytes.length);
    bytes.set(nsBytes, 0);
    bytes.set(nameBytes, nsBytes.length);
    const hex = await sha1hex(bytes);
    const parts = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      (parseInt(hex.slice(12, 16), 16) & 0x0fff | 0x5000)
        .toString(16)
        .padStart(4, "0"),
      (parseInt(hex.slice(16, 20), 16) & 0x3fff | 0x8000)
        .toString(16)
        .padStart(4, "0"),
      hex.slice(20, 32),
    ];
    return parts.join("-");
  }

  const DNS_NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  let cached = null;

  window.getNonePartnerUUID = async function getNonePartnerUUID() {
    if (cached) return cached;
    cached = await uuidv5("crm_vfinal:none-partner", DNS_NS);
    return cached;
  };
})();
