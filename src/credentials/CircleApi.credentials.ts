import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class CircleApi implements ICredentialType {
	name = 'circleApi';
	displayName = 'Circle API';
	documentationUrl = 'https://api.circle.so';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Circle admin API token from Settings → API in your Circle community',
		},
		{
			displayName: 'Community ID',
			name: 'communityId',
			type: 'number',
			default: 0,
			required: true,
			description: 'Your Circle community ID (visible in Settings → API)',
		},
	];

	// Circle uses "Token <value>" not "Bearer <value>"
	authenticate = {
		type: 'generic' as const,
		properties: {
			headers: {
				Authorization: '=Token {{$credentials.apiToken}}',
			},
		},
	};
}
