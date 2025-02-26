// skript för att ersätta console.logs med logger
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { glob } from 'glob';

// få aktuell filsökväg i es modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// sökvägar att exkludera
const excludePaths = ['node_modules', 'dist', 'build', '.svelte-kit'];

// filtyper att inkludera
const includeExtensions = ['.js', '.svelte', '.ts'];

// hitta alla filer
glob('src/**/*.*', { ignore: excludePaths.map((p) => `**/${p}/**`) })
	.then((files) => {
		let totalReplaced = 0;
		let filesModified = 0;

		files.forEach((file) => {
			const ext = path.extname(file);
			if (!includeExtensions.includes(ext)) return;

			// hoppa över logger.js själv
			if (file.includes('logger.js')) return;

			let content = fs.readFileSync(file, 'utf8');
			let newContent = content;
			let replaced = false;

			// lägg till import av logger om det behövs
			if (
				content.includes('console.log') ||
				content.includes('console.error') ||
				content.includes('console.warn') ||
				content.includes('console.info')
			) {
				// ersätt console.log med logger.info etc.
				newContent = newContent.replace(/console\.log/g, 'logger.info');
				newContent = newContent.replace(/console\.error/g, 'logger.error');
				newContent = newContent.replace(/console\.warn/g, 'logger.warn');
				newContent = newContent.replace(/console\.info/g, 'logger.info');
				newContent = newContent.replace(/console\.debug/g, 'logger.debug');

				// räkna antal ersättningar
				const replacements = (newContent.match(/logger\.(info|error|warn|debug)/g) || []).length;

				if (replacements > 0) {
					replaced = true;
					totalReplaced += replacements;

					// lägg till import om det inte redan finns
					if (!newContent.includes('import { logger }')) {
						// hitta första import-satsen
						const importMatch = newContent.match(/import .+ from .+;/);
						if (importMatch) {
							const importStatement = importMatch[0];
							const importIndex = newContent.indexOf(importStatement);

							// lägg till logger-import efter första import
							newContent =
								newContent.slice(0, importIndex + importStatement.length) +
								"\nimport { logger } from '$lib/utils/logger';" +
								newContent.slice(importIndex + importStatement.length);
						} else {
							// ingen import hittades, lägg till i början av filen
							newContent = "import { logger } from '$lib/utils/logger';\n\n" + newContent;
						}
					}
				}
			}

			if (replaced) {
				fs.writeFileSync(file, newContent, 'utf8');
				filesModified++;
				console.log(`${file}: ersatte ${totalReplaced} console-anrop med logger`);
			}
		});

		console.log(`Totalt ersatta console-anrop: ${totalReplaced} i ${filesModified} filer`);
	})
	.catch((err) => {
		console.error('Fel vid sökning av filer:', err);
	});
