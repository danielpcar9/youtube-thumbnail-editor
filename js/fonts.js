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
    const linkId = `gfont-${fontFamily.toLowerCase().replace(/\s+/g, '-')}`;
    let link = document.getElementById(linkId);
    const linkAlreadyExisted = !!link;

    const finish = () => {
      loadedFonts.add(fontFamily);
      resolve(fontFamily);
    };

    // Once the Google Fonts stylesheet is actually in the CSSOM (so its
    // @font-face rules exist), force-load the specific weights this app
    // draws with (400 normal + 900 bold, matching the ":wght@400;700;900"
    // query below and the default fontWeight used by new text layers).
    // Without this, canvas measureText/fillText can silently fall back to a
    // system font for a brief period (or indefinitely on a slow network),
    // producing a text box sized/aligned for the wrong font.
    const forceLoadWeights = () => {
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load(`400 1em "${fontFamily}"`),
          document.fonts.load(`900 1em "${fontFamily}"`)
        ]).then(finish).catch(finish);
      } else {
        setTimeout(finish, 1000);
      }
    };

    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      const formattedName = fontFamily.replace(/\s+/g, '+');
      link.href = `https://fonts.googleapis.com/css2?family=${formattedName}:wght@400;700;900&display=swap`;
      link.addEventListener('load', forceLoadWeights);
      link.addEventListener('error', finish); // fail gracefully, don't hang forever
      document.head.appendChild(link);
    } else if (linkAlreadyExisted) {
      // A <link> for this font already exists (e.g. requested twice in
      // quick succession) but hasn't been recorded as loaded yet.
      forceLoadWeights();
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
