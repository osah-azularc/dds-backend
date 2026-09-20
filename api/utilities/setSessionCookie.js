export function setCookie(
  res,
  cookieKey,
  data,
  optionalData = {
    //maxAge: 365 * 24 * 60 * 60 * 1000  //one year
  },
) {
  res.cookie(cookieKey, data, optionalData);
}
