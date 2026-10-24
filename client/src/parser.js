(function initializeParser(root, factory) {
  const parser = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = parser;
  }

  root.parser = Object.freeze(parser);
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const PRICE_SELECTORS = [
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    "#desktop_buybox .a-price .a-offscreen",
    "#buybox .a-price .a-offscreen",
    ".priceToPay .a-offscreen",
    "#priceblock_dealprice",
    "#priceblock_ourprice",
    "#price_inside_buybox",
  ];

  function parseProduct(doc, pageLocation) {
    const asin = getAsin(doc, pageLocation.href);
    if (!asin) return null;

    const title = text(doc, "#productTitle");

    return {
      asin,
      url: `https://www.amazon.com/dp/${asin}`,
      title,
      brand: cleanBrand(text(doc, "#bylineInfo")),
      model: getModel(doc),
      variant: getVariant(doc, title),
      price: getPrice(doc),
      currency: "USD",
      image: getImage(doc, pageLocation.href),
    };
  }

  function getAsin(doc, url) {
    const inputAsin =
      doc.querySelector("input#ASIN")?.value ||
      doc.querySelector("input[name='ASIN']")?.value;
    if (/^[A-Z0-9]{10}$/i.test(inputAsin || "")) {
      return inputAsin.toUpperCase();
    }

    const match = String(url).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    return match ? match[1].toUpperCase() : null;
  }

  function getVariant(doc, title) {
    const variants = [];

    for (const section of doc.querySelectorAll("[id^='variation_']")) {
      const value =
        text(section, ".selection") ||
        text(section, "option:checked") ||
        attribute(section, "[aria-checked='true']", "title");

      if (value) variants.push(value);
    }

    if (variants.length) return [...new Set(variants)].join(" / ");

    const titleVariant = title?.match(/\(([^()]+)\)\s*$/);
    return titleVariant?.[1] || null;
  }

  function getPrice(doc) {
    const hiddenPrice = doc.querySelector("#twister-plus-price-data-price")?.value;
    const parsedHiddenPrice = parseMoney(hiddenPrice);
    if (parsedHiddenPrice !== null) return parsedHiddenPrice;

    for (const selector of PRICE_SELECTORS) {
      const price = parseMoney(text(doc, selector));
      if (price !== null) return price;
    }

    for (const selector of ["#corePrice_feature_div", "#apex_desktop", "#desktop_buybox"]) {
      const container = doc.querySelector(selector);
      if (!container) continue;
      const whole = text(container, ".a-price-whole")?.replace(/\D/g, "");
      const fraction = text(container, ".a-price-fraction")?.replace(/\D/g, "");
      if (whole) return Number(`${whole}.${fraction || "00"}`);
    }

    return null;
  }

  function parseMoney(value) {
    const match = String(value || "").match(/\d[\d,]*(?:\.\d{1,2})?/);
    if (!match) return null;

    const price = Number(match[0].replaceAll(",", ""));
    return Number.isFinite(price) ? price : null;
  }

  function getModel(doc) {
    const rows = doc.querySelectorAll(
      "#productDetails_detailBullets_sections1 tr, " +
        "#productDetails_techSpec_section_1 tr, " +
        "#detailBullets_feature_div li",
    );

    for (const row of rows) {
      const label =
        text(row, "th") || text(row, ".a-text-bold") || text(row, ".a-color-secondary");
      if (!/^(item model number|model number|model name|model)\s*:?$/i.test(label || "")) {
        continue;
      }

      const value = text(row, "td") || text(row, ".a-list-item");
      return value?.replace(label, "").replace(/^\s*:\s*/, "").trim() || null;
    }

    return null;
  }

  function getImage(doc, baseUrl) {
    const image = doc.querySelector("#landingImage");
    const source =
      image?.getAttribute("data-old-hires") ||
      image?.currentSrc ||
      image?.src ||
      attribute(doc, "meta[property='og:image']", "content");

    if (!source) return null;

    try {
      const url = new URL(source, baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      url.protocol = "https:";
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function cleanBrand(value) {
    return (
      value
        ?.replace(/^visit the\s+/i, "")
        .replace(/^brand\s*:\s*/i, "")
        .replace(/\s+store$/i, "")
        .trim() || null
    );
  }

  function text(rootElement, selector) {
    return rootElement.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || null;
  }

  function attribute(rootElement, selector, name) {
    return rootElement.querySelector(selector)?.getAttribute(name)?.trim() || null;
  }

  return {
    parseProduct,
    getAsin,
    parseMoney,
    cleanBrand,
  };
});
