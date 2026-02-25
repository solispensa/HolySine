import fs from 'fs';
import JavaScriptObfuscator from 'javascript-obfuscator';

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

    // Combine and Obfuscate JS
    const rawJS = `${audioProc}\n\n${main}`;

    // Using aggressive defense settings
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawJS, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 1,
        disableConsoleOutput: true
    });

    const scriptTag = `<script>\n${obfuscatedResult.getObfuscatedCode()}\n</script>`;
    standalone = standalone.replace('<script type="module" src="/main.js"></script>', scriptTag);

    fs.writeFileSync('standalone.html', standalone);
    console.log('Successfully created standalone.html');
    process.exit(0);
} catch (e) {
    console.error(e);
    process.exit(1);
}
