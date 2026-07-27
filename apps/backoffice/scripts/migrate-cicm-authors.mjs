import { createHash } from 'node:crypto';
import process from 'node:process';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const LINK_CONTENT = process.argv.includes('--link-content');
const DATABASE_URI = process.env.WEBSITEDB_URI;
const COLLECTIONS = [
	{ legacyField: 'author', slug: 'articles' },
	{ legacyField: 'author', slug: 'videos' },
	{ legacyField: 'author', slug: 'case-studies' },
	{ legacyField: 'host', slug: 'interviews' },
];
const DEFAULT_INTERVIEW_AUTHOR = {
	bio: '',
	expertAuthor: false,
	name: 'Equipa Carris',
	role: 'Equipa Carris',
	social: {},
};

if (LINK_CONTENT && !APPLY) {
	throw new Error('--link-content requires --apply.');
}

if (!DATABASE_URI) {
	throw new Error('WEBSITEDB_URI is required.');
}

function normalizeText(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeSocial(value) {
	if (!value || typeof value !== 'object') return {};

	return Object.fromEntries(
		['linkedin', 'twitter', 'email']
			.map(key => [key, normalizeText(value[key])])
			.filter(([, entry]) => Boolean(entry)),
	);
}

function normalizeAuthor(profile) {
	const name = normalizeText(profile?.name);
	const role = normalizeText(profile?.role);

	return {
		bio: normalizeText(profile?.bio),
		expertAuthor: Boolean(profile?.expertAuthor),
		name,
		picture: profile?.picture ?? undefined,
		role,
		social: normalizeSocial(profile?.social),
	};
}

function hasProfile(profile) {
	return Boolean(profile.name || profile.role || profile.bio || profile.picture || Object.keys(profile.social).length);
}

function fingerprint(profile) {
	return createHash('sha256').update(JSON.stringify({
		bio: profile.bio,
		expertAuthor: profile.expertAuthor,
		name: profile.name.toLocaleLowerCase('pt-PT'),
		picture: String(profile.picture ?? ''),
		role: profile.role,
		social: profile.social,
	})).digest('hex');
}

function legacyFingerprint(profile) {
	return createHash('sha256').update(JSON.stringify({
		bio: profile.bio,
		expertAuthor: profile.expertAuthor,
		name: profile.name.toLocaleLowerCase('pt-PT'),
		picture: '',
		role: profile.role,
		social: profile.social,
	})).digest('hex');
}

function slugify(value) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '') || 'autor';
}

async function uniqueSlug(authors, base, profileFingerprint) {
	const matchingAuthors = await authors.find({ slug: { $regex: `^${base}(?:-[0-9]+)?$` } }).toArray();
	const matchingFingerprint = matchingAuthors.find(author => author.migrationFingerprint === profileFingerprint);
	if (matchingFingerprint) return { existing: matchingFingerprint, slug: matchingFingerprint.slug };

	const occupied = new Set(matchingAuthors.map(author => author.slug));
	if (!occupied.has(base)) return { slug: base };

	let suffix = 2;
	while (occupied.has(`${base}-${suffix}`)) suffix += 1;
	return { slug: `${base}-${suffix}` };
}

async function main() {
	await mongoose.connect(DATABASE_URI);
	const db = mongoose.connection.db;
	const authors = db.collection('authors');
	const authorsByFingerprint = new Map();
	const summary = { createdAuthors: 0, dryRun: !APPLY, linkedDocuments: 0, repairedPictures: 0, reusedAuthors: 0, skippedDocuments: 0 };

	for (const { legacyField, slug } of COLLECTIONS) {
		const documents = await db.collection(slug).find({}).toArray();

		for (const document of documents) {
			const legacyProfile = normalizeAuthor(document[legacyField]);
			const profile = hasProfile(legacyProfile)
				? legacyProfile
				: slug === 'interviews'
					? DEFAULT_INTERVIEW_AUTHOR
					: undefined;

			if (!profile) {
				summary.skippedDocuments += 1;
				console.log(`${slug}/${document._id}: skipped (empty ${legacyField})`);
				continue;
			}

			const profileFingerprint = fingerprint(profile);
			const existing = authorsByFingerprint.get(profileFingerprint)
				?? await authors.findOne({ migrationFingerprint: { $in: [profileFingerprint, legacyFingerprint(profile)] } });
			let author = existing;

			if (author) {
				summary.reusedAuthors += 1;
				if (profile.picture && !author.picture) {
					if (APPLY) {
						await authors.updateOne(
							{ _id: author._id },
							{ $set: { migrationFingerprint: profileFingerprint, picture: profile.picture } },
						);
					}
					author.picture = profile.picture;
					summary.repairedPictures += 1;
				}
			}
			else {
				const slugResolution = await uniqueSlug(authors, slugify(profile.name), profileFingerprint);
				author = slugResolution.existing;

				if (author) {
					summary.reusedAuthors += 1;
				}
				else {
					author = {
						...profile,
						migrationFingerprint: profileFingerprint,
						slug: slugResolution.slug,
					};
					if (APPLY) {
						const result = await authors.insertOne(author);
						author._id = result.insertedId;
					}
					summary.createdAuthors += 1;
				}
			}
			authorsByFingerprint.set(profileFingerprint, author);

			if (LINK_CONTENT && author._id) {
				const currentAuthorIds = (document.authors ?? []).map(String);
				if (currentAuthorIds.length !== 1 || currentAuthorIds[0] !== String(author._id)) {
					await db.collection(slug).updateOne({ _id: document._id }, { $set: { authors: [author._id] } });
					summary.linkedDocuments += 1;
				}
			}

			console.log(`${slug}/${document._id}: ${author.slug} (${author._id ?? 'dry-run'})`);
		}
	}

	console.log(JSON.stringify(summary, null, 2));
	await mongoose.disconnect();
}

await main();
