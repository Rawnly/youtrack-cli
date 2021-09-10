#!/usr/bin/env node
import chalk from 'chalk'
import signale from 'signale'
import {exit} from 'process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { Youtrack } from 'youtrack-rest-client'
import Conf from 'conf'
import ms from 'ms'
import * as E from 'fp-ts/Either'

import format from 'date-fns/format'
import { formatTotalTime, getEstimation, getEstimationByIssue, getTotalTime } from './util'


type Args = {
	issue?: string;
	time?: string
	text?: string
	token?: string
}

const uppercase = (text: string): string => text.toUpperCase()

type Config = {
	token: string;
	cache?: Record<string, {
		date: number;
		minutes: number;
	}>
}

const config = new Conf<Config>()

yargs(hideBin(process.argv))
	.scriptName('youtrack')
	.command('set-token <token>', 'Configure a new token', () => {}, args => {
		config.set('token', args.token)
		signale.success('Token Configured!')
	})
	.command('get-token', 'Get saved token', {}, args => {
		signale.info('Token: ', config.get('token'))
	})
	.command('issue <issueId>', 'Get issue infos', {}, async args => {
		const youTrack = new Youtrack({
			baseUrl: 'https://yt.intranet.aquacloud.it/youtrack/api',
			token: config.get('token')
		})

		const issueId = uppercase(args.issueId as string);
		const issue = await youTrack.issues.byId(issueId)
		let estimationEither = await getEstimationByIssue(youTrack)(issue)()

		const estimation = E.isLeft(estimationEither)
			? 0
			: estimationEither.right

		const spentTime = await getTotalTime(youTrack, issue.id)

		console.log(chalk`
	{bold [${issue.id}] - ${issue.summary}}
{dim ${issue.description.split('\n').map(line => `\t${line}`).join('\n')}}
	-------------------
	Reported by {bold {yellow @${issue.reporter.login}}}
	Updated by {bold {yellow @${issue.updater.login}}} on {yellow ${format(issue.updated, 'dd/MM/yyyy hh:mm:ss')}}
	-------------------
	${issue.comments.length} ${issue.comments.length === 1 ? 'Comment' : 'Comments'}
	Project: {bold ${issue.project.name}} {dim [${issue.project.shortName}]}
	-------------------
	Status: ${issue.resolved ? 'Resolved' : 'Unresolved'}
	Tags: {bold {underline ${issue.tags.map(tag => '#'+tag.name).join(', ')}}}
	-------------------
	Spent Time: {bold {${estimation < spentTime ? 'bgRed' : 'green'}  ${formatTotalTime(spentTime)} }}
	Estimation: {bold  ${formatTotalTime(estimation)} }
`)

	})
	.command('get-time <issueId>', 'Get issue logged time',{
		compare: {
			type: 'boolean'
		}
	}, async (args) => {
		const apiClient = new Youtrack({
			baseUrl: 'https://yt.intranet.aquacloud.it/youtrack/api',
			token: config.get('token')
		})

		const issueId = uppercase(args.issueId as string)
		const cache = config.get('cache', {})

		let minutes = 0;

		if ( isValidCache(issueId)) {
			minutes = cache[issueId].minutes
		}

		if ( minutes === 0 ) {
			minutes = await getTotalTime(apiClient, issueId)
		}

		cacheResult(issueId, minutes)

		// minutes to ms
		const formattedTime = formatTotalTime(minutes);

		if ( args.compare ) {
			const estimationEither = await getEstimation(apiClient)(issueId)();

			if ( E.isLeft(estimationEither) ) {
				console.log(formatTotalTime)
				return
			}

			const estimation = estimationEither.right

			let color = ''

			if ( estimation < minutes ) {
				color = 'bgRed'
			}

			if ( estimation >= minutes ) {
				color = 'bgGreen'
			}

			console.log(chalk`{${color} ${formattedTime}}`)
			return
		}

		console.log(formattedTime);
	})
	.command('log <time> [text]', 'Log time', {
		issue: {
			describe: 'ISSUE NUMBER (SF-{n})',
			string: true,
			demand: true,
		}
	}, async (args) => {
		const TOKEN = config.get('token')

		if ( !TOKEN ) {
			signale.fatal('No Token configured.')
			exit(1)
		}

		const apiClient = new Youtrack({
			baseUrl: 'https://yt.intranet.aquacloud.it/youtrack/api',
			token: TOKEN,
		})

		const issueId = uppercase(args.issue);
		signale.pending('Loading issue...')

		const issue = await apiClient.issues.byId(issueId)

		signale.complete('Issue infos retrieved')
		console.log(`${issue.id} - ${issue.summary}`)

		const workItem = await apiClient.workItems.create(issueId, {
			text: args.text as string,
			duration: {
				presentation: args.time as string
			},
			type: {
				id: '107-0',
				name: 'Development'
			}
		})

		invalidateCache(issueId)

		signale.success(`${issue.id} - ${workItem.duration?.presentation}`)
	})
	.help()
	.argv


function cacheResult(issueId: string, minutes: number) {
	const cache = config.get('cache', {})
	cache[issueId] = {
		date: Date.now(),
		minutes: minutes
	}

	config.set('cache', cache)
}

function invalidateCache(issueId: string) {
	const cache = config.get('cache', {})
	delete cache[issueId]

	config.set('cache', cache)
}

function isValidCache(issueId: string): boolean {
	const cache = config.get('cache', {})
	if ( cache[issueId] ) {
		return (Date.now() - cache[issueId].date) < ms('10m')
	}

	return false
}
