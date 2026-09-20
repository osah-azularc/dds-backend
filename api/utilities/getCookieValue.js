export function getCookieValue(cookie, cookiename) {
  const cookiestring = RegExp(cookiename + "=[^;]+").exec(cookie);
  return decodeURIComponent(
    !!cookiestring ? cookiestring.toString().replace(/^[^=]+./, "") : "",
  );
}
