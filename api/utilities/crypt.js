// Nodejs encryption with CTR
/**  for encryption and decryption data @@author :: Ashutosh Telang
 */
import crypto from "node:crypto";
const algorithm = "aes-128-cbc";
const secrtetKey = "fcaycgavfhvfhsvfjhkasvibmsdnvksadbfalkbfweib";

export function encrypt(payload) {
  try {
    const mykey = crypto.createCipher(algorithm, secrtetKey);
    const cryptedPayload = mykey.update(payload, "utf8", "hex");
    cryptedPayload += mykey.final("hex");
    return { payload: cryptedPayload, encrypted: true };
  } catch (e) {
    return { payload: "", encrypted: false };
  }
}

export function decrypt(payload) {
  try {
    const mykey = crypto.createDecipher(algorithm, secrtetKey);
    const outputPayload = mykey.update(payload, "hex", "utf8");
    outputPayload += mykey.final("utf8");

    return { payload: outputPayload, decrypted: true };
  } catch (e) {
    return { payload: "", decrypted: false };
  }
}
