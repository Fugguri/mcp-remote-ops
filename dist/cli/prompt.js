import readline from "node:readline";
function muteOutput(rl) {
    const out = process.stdout;
    const originalWrite = out.write.bind(out);
    let muted = false;
    rl._writeToOutput = (stringToWrite) => {
        if (muted && stringToWrite !== "\r\n" && stringToWrite !== "\n") {
            originalWrite("*");
        }
        else {
            originalWrite(stringToWrite);
        }
    };
    return {
        mute: () => (muted = true),
        unmute: () => (muted = false),
    };
}
export async function ask(question, opts = {}) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const muteCtl = opts.secret ? muteOutput(rl) : null;
    const hint = opts.default ? ` [${opts.secret ? "***" : opts.default}]` : "";
    const required = opts.required ? " *" : "";
    const prompt = `${question}${required}${hint}: `;
    while (true) {
        const answer = await new Promise((resolve) => {
            muteCtl?.mute();
            rl.question(prompt, (a) => {
                muteCtl?.unmute();
                if (opts.secret)
                    process.stdout.write("\n");
                resolve(a);
            });
        });
        const value = answer.trim() || (opts.default ?? "");
        if (value || !opts.required) {
            rl.close();
            return value;
        }
        process.stdout.write("Required field, please enter a value.\n");
    }
}
export async function confirm(question, defaultYes = false) {
    const hint = defaultYes ? " [Y/n]" : " [y/N]";
    const answer = (await ask(question + hint)).toLowerCase();
    if (!answer)
        return defaultYes;
    return answer === "y" || answer === "yes" || answer === "д" || answer === "да";
}
//# sourceMappingURL=prompt.js.map