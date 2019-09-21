export default function isNullVoid(parameter) {
  if (parameter === void 0 || parameter === null) return true;
  return false;
}
