import type { CollectionConfig } from 'payload';

import { publishedAtField } from '@/fields/published-at';
import { updatedAtField } from '@/fields/updated-at';
import { slugify } from '@/utils/slugify';

export const Interviews: CollectionConfig = {
	access: {
		create: ({ req: { user } }) => Boolean(user),
		delete: ({ req: { user } }) => Boolean(user),
		read: ({ req: { user } }) => {
			if (user) return true;
			return { status: { equals: 'published' } };
		},
		update: ({ req: { user } }) => Boolean(user),
	},

	admin: {
		defaultColumns: ['title', 'host.name', 'status', 'publishDate'],
		useAsTitle: 'title',
	},

	fields: [
		{
			label: 'Título',
			maxLength: 200,
			name: 'title',
			required: true,
			type: 'text',
		},
		{
			index: true,
			label: 'Slug',
			name: 'slug',
			required: true,
			type: 'text',
			unique: true,
		},
		{
			label: 'Descrição',
			maxLength: 300,
			name: 'description',
			required: true,
			type: 'textarea',
		},

		{
			fields: [
				{
					label: 'Nome',
					name: 'name',
					required: true,
					type: 'text',
				},
				{
					label: 'Cargo/Função',
					name: 'role',
					required: true,
					type: 'text',
				},
				{
					filterOptions: {
						mimeType: { contains: 'image' },
					},
					label: 'Foto',
					name: 'picture',
					relationTo: 'media',
					required: false,
					type: 'upload',
				},
				{
					label: 'Descrição',
					maxLength: 500,
					name: 'description',
					required: false,
					type: 'textarea',
				},
				{
					fields: [
						{
							label: 'LinkedIn',
							name: 'linkedin',
							type: 'text',
						},
						{
							label: 'X (Twitter)',
							name: 'twitter',
							type: 'text',
						},
						{
							label: 'Email',
							name: 'email',
							type: 'email',
						},
					],
					label: 'Redes Sociais',
					name: 'social',
					type: 'group',
				},
			],
			label: 'Host',
			name: 'host',
			type: 'group',
		},

		{
			fields: [
				{
					label: 'Nome',
					name: 'name',
					required: true,
					type: 'text',
				},
				{
					label: 'Cargo/Função',
					name: 'role',
					required: true,
					type: 'text',
				},
				{
					filterOptions: {
						mimeType: { contains: 'image' },
					},
					label: 'Foto',
					name: 'picture',
					relationTo: 'media',
					required: false,
					type: 'upload',
				},
			],
			label: 'Convidado',
			name: 'guest',
			type: 'group',
		},

		{
			filterOptions: {
				mimeType: { contains: 'audio' },
			},
			label: 'Áudio',
			name: 'audio',
			relationTo: 'media',
			required: false,
			type: 'upload',
		},

		{
			admin: {
				position: 'sidebar',
			},
			defaultValue: 'draft',
			label: 'Status',
			name: 'status',
			options: [
				{ label: 'Rascunho', value: 'draft' },
				{ label: 'Publicado', value: 'published' },
			],
			required: true,
			type: 'select',
		},

		publishedAtField,
		updatedAtField,
	],

	hooks: {
		beforeChange: [
			async ({ data }) => {
				if (data.status === 'published' && !data.publishDate) {
					data.publishDate = new Date();
				}
			},
		],
		beforeValidate: [
			async ({ data }) => {
				if (data.title && !data.slug) {
					data.slug = slugify(data.title);
				}
				if (data.slug) {
					data.slug = slugify(data.slug);
				}
			},
		],
	},

	labels: {
		plural: 'Entrevistas',
		singular: 'Entrevista',
	},

	slug: 'interviews',

	timestamps: false,
};
