// Vite's ?raw imports: a file's text (the options page's markup, in its test).
declare module '*?raw' {
  const text: string;
  export default text;
}
