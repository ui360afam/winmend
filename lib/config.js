'use strict';
// Site-wide settings. Change the brand here (or with environment variables).
module.exports = {
  SITE_NAME: process.env.SITE_NAME || 'WinMend',
  SITE_NAME_A: process.env.SITE_NAME_A || 'Win',
  SITE_NAME_B: process.env.SITE_NAME_B || 'Mend',
  TAGLINE: process.env.SITE_TAGLINE || 'Read the code. Find the cause. Fix it safely.',
  BASE_URL: (process.env.BASE_URL || 'https://crisp-brook-1265.s2.seeiousercontent.com').replace(/\/$/, ''),
  // Bump when any file in public/assets changes so browsers fetch the new copy.
  ASSET_V: '1',
  PORT: Number(process.env.PORT || 8080),
};
