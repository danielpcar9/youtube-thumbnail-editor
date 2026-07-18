// Available font families categorized
export const GOOGLE_FONTS = [
  'Anton',
  'Montserrat',
  'Bebas Neue',
  'Poppins',
  'Oswald',
  'Outfit',
  'Rubik',
  'Inter',
  'Fredoka',
  'Playfair Display',
  'Lora'
];

export const SYSTEM_FONTS = [
  'Impact',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New'
];

const loadedFonts = new Set();

/**
 * Dynamically loads a Google Font by adding a link tag to the document head
 * and returning a Promise that resolves when the font is ready.
 * @param {string} fontFamily 
 * @returns {Promise<string>} Resolves with the font family name
 */
export function loadFont(fontFamily) {
  if (SYSTEM_FONTS.includes(fontFamily) || loadedFonts.has(fontFamily)) {
    return Promise.resolve(fontFamily);
  }

  return new Promise((resolve) => {
    // Check if the link already exists in the document
    const linkId = `gfont-${fontFamily.toLowerCase().replace(/\s+/g, '-')}`;
    let link = document.getElementById(linkId);

    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      const formattedName = fontFamily.replace(/\s+/g, '+');
      link.href = `https://fonts.googleapis.com/css2?family=${formattedName}:wght@400;700;900&display=swap`;
      document.head.appendChild(link);
    }

    // Wait until document.fonts has loaded the specific font
    // or fallback to a timeout if API is not supported
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`1em "${fontFamily}"`)
        .then(() => {
          loadedFonts.add(fontFamily);
          resolve(fontFamily);
        })
        .catch(() => {
          // Resolve anyway as fallback
          loadedFonts.add(fontFamily);
          resolve(fontFamily);
        });
    } else {
      setTimeout(() => {
        loadedFonts.add(fontFamily);
        resolve(fontFamily);
      }, 1000);
    }
  });
}

/**
 * Initializes and preloads essential thumbnail fonts.
 */
export function preloadCommonFonts() {
  const common = ['Anton', 'Montserrat', 'Bebas Neue'];
  return Promise.all(common.map(loadFont));
}
