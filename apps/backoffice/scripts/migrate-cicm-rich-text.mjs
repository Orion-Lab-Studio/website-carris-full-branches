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
const MIGRATION_TARGETS = [
	{
		collection: 'reports',
		fields: ['featuredSummary.description', 'methodology'],
	},
	{
		collection: 'videos',
		fields: ['content'],
	},
];

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

function getValueAtPath(document, path) {
	return path.split('.').reduce(
		(value, segment) => value && typeof value === 'object' ? value[segment] : undefined,
		document,
	);
}

function getMigrationUpdate(document, fields) {
	const update = {};

	for (const field of fields) {
		const value = getValueAtPath(document, field);
		if (!isLexicalEditorState(value) && typeof value === 'string' && value.trim()) {
			update[field] = convertMarkdownToLexical(value);
		}
	}

	return update;
}

async function main() {
	await mongoose.connect(DATABASE_URI);

	const summary = {
		collections: {},
		documentsMigrated: 0,
		documentsScanned: 0,
		documentsSkipped: 0,
		dryRun: !APPLY,
		fieldsConverted: 0,
	};

	for (const target of MIGRATION_TARGETS) {
		const collection = mongoose.connection.db.collection(target.collection);
		const collectionSummary = {
			documentsMigrated: 0,
			documentsScanned: 0,
			documentsSkipped: 0,
			fieldsConverted: 0,
		};
		summary.collections[target.collection] = collectionSummary;

		for await (const document of collection.find({})) {
			collectionSummary.documentsScanned += 1;
			summary.documentsScanned += 1;
			const update = getMigrationUpdate(document, target.fields);
			const fields = Object.keys(update);

			if (!fields.length) {
				collectionSummary.documentsSkipped += 1;
				summary.documentsSkipped += 1;
				continue;
			}

			if (APPLY) {
				await collection.updateOne({ _id: document._id }, { $set: update });
			}

			collectionSummary.documentsMigrated += 1;
			collectionSummary.fieldsConverted += fields.length;
			summary.documentsMigrated += 1;
			summary.fieldsConverted += fields.length;
			console.log(`${target.collection}/${document.slug ?? document._id}: ${fields.join(', ')}`);
		}
	}

	console.log(JSON.stringify(summary, null, 2));
	await mongoose.disconnect();
}

await main();
