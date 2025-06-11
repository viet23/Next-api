require('dotenv').config()

export const jwtConstants = {
  secret: 'secretKey',
}

export const smartFaceCert = {
  client_id: process.env.SMARTFACE_CLIENT_ID,
  client_secret: process.env.SMARTFACE_CLIENT_SECRET,
  grant_type: process.env.SMARTFACE_GRANT_TYPE,
  username: process.env.SMARTFACE_ACCOUNT,
  password: process.env.SMARTFACE_PASSWORD,
}
