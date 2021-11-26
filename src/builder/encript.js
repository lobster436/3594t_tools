const crypto = require('crypto').webcrypto;

const secretKeyOrg = process.env.SECRETKEY || ''
const baseOrg = process.env.BASE || ''

createSecret(`XYZ-${secretKeyOrg}-${baseOrg}`).then(password => {
  encript(secretKeyOrg, password).then(secretKey => {
    encript(baseOrg, password).then(base => {
      const secretInfo = {
        password,
        secretKey,
        base,
      }
      const secretValue = Buffer.from(JSON.stringify(secretInfo)).toString('base64')
      console.log(`const secret = '${secretValue}';`)
    })
  })
})

async function createSecret(secretWord) {
  return Buffer.from(JSON.stringify(await crypto.subtle.exportKey(
    'jwk',
    await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: crypto.getRandomValues(new Uint8Array(16)),
        iterations: 100000,
        hash: 'SHA-256'
      },
      await crypto.subtle.importKey(
        'raw',
        await crypto.subtle.digest(
          { name: 'SHA-256' },
          new TextEncoder().encode(secretWord)
        ),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      ),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  ))).toString('base64')
}

async function encript(input, password) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(JSON.stringify({
    iv: Array.from(iv),
    value: Array.from(new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await crypto.subtle.importKey(
        'jwk',
        JSON.parse(Buffer.from(password, 'base64').toString()),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      ),
      new TextEncoder().encode(input)
    )))
  })).toString('base64')
}

async function decode(encoded) {
  const secretInfo = JSON.parse(Buffer.from(encoded, 'base64').toString())
  return {
    secretKey: await decript(secretInfo.secretKey, secretInfo.password),
    base: await decript(secretInfo.base, secretInfo.password),
  }
}

async function decript(input, password) {
  const inputOrg = JSON.parse(Buffer.from(input, 'base64').toString())
  return new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(inputOrg.iv) },
    await crypto.subtle.importKey(
      'jwk',
      JSON.parse(Buffer.from(password, 'base64').toString()),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    ),
    toArrayBuffer(new Uint8Array(inputOrg.value))
  ))
}

function toArrayBuffer(buffer) {
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}
