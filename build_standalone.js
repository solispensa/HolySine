import fs from 'fs';

try {
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');
    let audioProc = fs.readFileSync('audioProcessor.js', 'utf8');
    let main = fs.readFileSync('main.js', 'utf8');

    // Remove `export` from class AudioProcessor
    audioProc = audioProc.replace('export class AudioProcessor', 'class AudioProcessor');

    // Remove import { AudioProcessor } from ...
    main = main.split('\n').filter(line => !line.includes('import')).join('\n');

    // Inject CSS
    const styleTag = `<style>\n${css}\n</style>`;
    let standalone = html.replace('<link rel="stylesheet" href="./style.css" />', styleTag);

    // Inject JS
    const scriptTag = `<script>\n${audioProc}\n\n${main}\n</script>`;
    standalone = standalone.replace('<script type="module" src="/main.js"></script>', scriptTag);

    fs.writeFileSync('standalone.html', standalone);
    console.log('Successfully created standalone.html');
    process.exit(0);
} catch (e) {
    console.error(e);
    process.exit(1);
}
