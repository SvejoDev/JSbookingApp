// skript för att ta bort console.logs från hela projektet
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { glob } from 'glob';

// få aktuell filsökväg i ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// mönster för att hitta console-anrop med olika mönster
const patterns = [
	// Vanliga console-anrop
	/console\.(log|error|warn|info)\s*\([^)]*\)\s*;?/g,

	// Console-anrop med template literals som kan sträcka sig över flera rader
	/console\.(log|error|warn|info)\s*\(`[^`]*`\)\s*;?/g,

	// Console-anrop med backticks som kan innehålla ${} uttryck
	/console\.(log|error|warn|info)\s*\(`[^`]*\${[^}]*}[^`]*`\)\s*;?/g,

	// Rader som slutar med );
	/^\s*\)\s*;?\s*$/gm,

	// Tomma parenteser
	/\(\s*\)\s*;?\s*$/gm
];

// sökvägar att exkludera
const excludePaths = ['node_modules', 'dist', 'build', '.svelte-kit'];

// filtyper att inkludera
const includeExtensions = ['.js', '.svelte', '.ts'];

// hitta alla filer
glob('src/**/*.*', { ignore: excludePaths.map((p) => `**/${p}/**`) })
	.then((files) => {
		let totalRemoved = 0;

		files.forEach((file) => {
			const ext = path.extname(file);
			if (!includeExtensions.includes(ext)) return;

			let content = fs.readFileSync(file, 'utf8');
			let newContent = content;

			// Applicera alla mönster
			for (const pattern of patterns) {
				newContent = newContent.replace(pattern, '');
			}

			// Ta bort tomma rader (mer än en i rad)
			newContent = newContent.replace(/\n\s*\n\s*\n/g, '\n\n');

			// Fixa rader som bara innehåller );
			newContent = newContent.replace(/^\s*\);\s*$/gm, '');

			// Räkna antal borttagna rader
			const removedLines = content.split('\n').length - newContent.split('\n').length;

			if (content !== newContent) {
				fs.writeFileSync(file, newContent, 'utf8');
				totalRemoved += removedLines;
				console.log(`${file}: tog bort ${removedLines} rader`);
			}
		});

		console.log(`Totalt borttagna rader: ${totalRemoved}`);
	})
	.catch((err) => {
		console.error('Fel vid sökning av filer:', err);
	});
