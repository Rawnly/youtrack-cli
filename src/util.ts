import { Youtrack, Issue } from 'youtrack-rest-client';

import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/lib/function';


export const getTotalTime = async (apiClient: Youtrack, issueId: string): Promise<number> => {
	const workItems = await apiClient.workItems.all(issueId as any)

	return workItems
		.reduce((acc, wk) => acc + wk.duration.minutes, 0)
}

export const formatTotalTime = (minutes: number, hoursInADay: number = 8): string => {
	const d = Math.floor(minutes / (60 * hoursInADay))
	const h = Math.floor((minutes - d * 60 * hoursInADay) / 60)
	const m = minutes - d * 60 * hoursInADay - h * 60

	return `${d}d ${h}h ${m}m`
}

type CustomField = {
	name: string;
	value: {
		minutes: number
	}
}



// type GetEstimation = (apiClient: Youtrack) => (issueId: string) => Promise<number>
type GetEstimation = (apiClient: Youtrack) => RTE.ReaderTaskEither<string, Error, number>


export const getEstimation : GetEstimation = (apiClient: Youtrack) => pipe(
	RTE.ask<string>(),
	RTE.chainTaskEitherK(issueId =>
		pipe(
			TE.tryCatch(
					() => apiClient.issues.byId(issueId),
					E.toError
				),
				TE.map(issue => issue.fields.find(f => f.name === 'Estimation').id),
				TE.map(fieldId => `/issues/${issueId}/customFields/${fieldId}?fields=name,value(minutes)`),
				TE.chain( url =>
					pipe(
						TE.tryCatch(
							(): Promise<CustomField> => apiClient.get(url) as any,
							E.toError
						),
						TE.map(field => field.value.minutes)
					)
				)
		)
	)
)

type GetEstimationByIssue = (apiClient: Youtrack) => RTE.ReaderTaskEither<Issue, Error, number>
export const getEstimationByIssue : GetEstimationByIssue = (apiClient: Youtrack) => pipe(
	RTE.ask<Issue>(),
	RTE.chainTaskEitherK(issue =>
		pipe(
			TE.right(issue),
				TE.map(issue => issue.fields.find(f => f.name === 'Estimation').id),
				TE.map(fieldId => `/issues/${issue.id}/customFields/${fieldId}?fields=name,value(minutes)`),
				TE.chain( url =>
					pipe(
						TE.tryCatch(
							(): Promise<CustomField> => apiClient.get(url) as any,
							E.toError
						),
						TE.map(field => field.value.minutes)
					)
				)
		)
	)
)
