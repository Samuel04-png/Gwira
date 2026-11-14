/** Downloaded testing artwork, loaded only by the development demo selector. */
const sarah=new URL('./test-profiles/sarah.png',import.meta.url).href;
const brian=new URL('./test-profiles/brian.png',import.meta.url).href;
const grace=new URL('./test-profiles/grace.png',import.meta.url).href;
const david=new URL('./test-profiles/david.png',import.meta.url).href;
const inventory=new URL('./test-profiles/inventory.png',import.meta.url).href;
const support=new URL('./test-profiles/support.png',import.meta.url).href;
const marketing=new URL('./test-profiles/marketing.png',import.meta.url).href;
const finance=new URL('./test-profiles/finance.png',import.meta.url).href;
export const testProfileArtwork:Readonly<Record<string,string>>={'Sarah Mwila':sarah,'Brian Phiri':brian,'Grace Banda':grace,'David Tembo':david,'Inventory Doat':inventory,'Customer Support Doat':support,'Marketing Doat':marketing,'Finance Doat':finance};
