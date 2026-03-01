module.exports = function fixTailwindUrls() {
  return {
    postcssPlugin: "postcss-fix-tailwind-urls",
    Declaration(decl) {
      if (decl.value && decl.value.includes("url(...)")) {
        decl.value = decl.value.replace(/url\(\.\.\.\)/g, "url(data:,)");
      }
    },
  };
};
module.exports.postcss = true;
