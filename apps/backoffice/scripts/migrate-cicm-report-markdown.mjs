import process from 'node:process';
import mongoose from 'mongoose';
import { createHeadlessEditor } from '@lexical/headless';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';

const APPLY = process.argv.includes('--apply');
const DATABASE_URI = process.env.WEBSITEDB_URI;

if (!DATABASE_URI) {
	throw new Error('WEBSITEDB_URI is required.');
}

function isLexicalEditorState(value) {
	return Boolean(
		value
		&& typeof value === 'object'
		&& !Array.isArray(value)
		&& value.root
		&& typeof value.root === 'object'
		&& !Array.isArray(value.root)
		&& value.root.type === 'root'
		&& Array.isArray(value.root.children),
	);
}

function convertMarkdownToLexical(markdown) {
	const editor = createHeadlessEditor({
		nodes: [CodeNode, HeadingNode, LinkNode, ListItemNode, ListNode, QuoteNode],
		onError: (error) => {
			throw error;
		},
	});

	editor.update(() => {
		$convertFromMarkdownString(markdown, TRANSFORMERS);
	}, { discrete: true });

	return editor.getEditorState().toJSON();
}

function getMigrationUpdate(report) {
	const update = {};
	const featuredDescription = report.featuredSummary?.description;

	if (!isLexicalEditorState(featuredDescription) && typeof featuredDescription === 'string' && featuredDescription.trim()) {
		update['featuredSummary.description'] = convertMarkdownToLexical(featuredDescription);
	}

	if (!isLexicalEditorState(report.methodology) && typeof report.methodology === 'string' && report.methodology.trim()) {
		update.methodology = convertMarkdownToLexical(report.methodology);
	}

	return update;
}

async function main() {
	await mongoose.connect(DATABASE_URI);

	const reports = mongoose.connection.db.collection('reports');
	const summary = {
		dryRun: !APPLY,
		fieldsConverted: 0,
		reportsMigrated: 0,
		reportsScanned: 0,
		reportsSkipped: 0,
	};

	for await (const report of reports.find({})) {
		summary.reportsScanned += 1;
		const update = getMigrationUpdate(report);
		const fields = Object.keys(update);

		if (!fields.length) {
			summary.reportsSkipped += 1;
			continue;
		}

		if (APPLY) {
			await reports.updateOne({ _id: report._id }, { $set: update });
		}

		summary.fieldsConverted += fields.length;
		summary.reportsMigrated += 1;
		console.log(`${report.slug ?? report._id}: ${fields.join(', ')}`);
	}

	console.log(JSON.stringify(summary, null, 2));
	await mongoose.disconnect();
}

await main();
