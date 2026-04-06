import payloadConfig from '@/payload-config';
import { getPublicHeaders } from '@/utils/get-public-headers';
import { getPayload, type Where } from 'payload';

/* * */

export const GET = async (request: Request) => {
	//

	//
	// A. Setup Payload and other necessary variables for handling requests.

	const { searchParams } = new URL(request.url);
	const limit = Number(searchParams.get('limit')) || 10;
	const page = Number(searchParams.get('page')) || 1;

	const payload = await getPayload({ config: payloadConfig });

	//
	// B. Build the where clause, filtering only published interviews.

	const whereClause: Where = {
		status: { equals: 'published' },
	};

	//
	// C. Retrieve published interviews from the database.

	const foundInterviews = await payload.find({
		collection: 'interviews',
		depth: 1,
		limit,
		page,
		sort: '-publishDate',
		where: whereClause,
	});

	//
	// Return interviews as a JSON response.

	return Response.json(foundInterviews, {
		headers: getPublicHeaders(60),
	});

	//
};
