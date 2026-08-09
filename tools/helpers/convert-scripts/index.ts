import { main as runTH } from './processing/scenes.ts';
import { main as runTsLogic } from './processing/logic.ts';

async function main() {
    console.log('--- Starting scenes generation ---\n')

    runTsLogic()

    await runTH()

    console.log('\n--- Scenes generated ---')
}

main().catch((error) => {
    console.error('Scene generation failed:', error)
    process.exitCode = 1
})
