(function () {
  if (window.__WIRED_nonePartnerUuid) return;
  window.__WIRED_nonePartnerUuid = true;

  // Namespace UUID (v5) based on a fixed DNS namespace + constant name.
  // Lightweight v5 impl (SHA-1) to avoid deps.
  function sha1(bytes) {
    const view =
      bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
    const slice = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    );
    return crypto.subtle.digest("SHA-1", slice).then((buffer) =>
      new Uint8Array(buffer)
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
    const digest = await sha1(bytes);
    const uuidBytes = digest.slice(0, 16);
    uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
    uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;

    const hex = Array.from(uuidBytes)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  const DNS_NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  let cached = null;

  window.getNonePartnerUUID = async function getNonePartnerUUID() {
    if (cached) return cached;
    cached = await uuidv5("crm_vfinal:none-partner", DNS_NS);
    return cached;
  };
})();
