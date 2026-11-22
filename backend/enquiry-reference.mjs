export function enquiryReferenceCode(reference) {
  return 'HEX-' + reference.slice(0, 8).toUpperCase();
}
