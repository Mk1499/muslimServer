<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Video importer (Phase 1)

A manually triggered, admin-only import of recent uploads from a fixed list of
YouTube channels. It creates **draft** videos only — nothing is published.

### Setup

1. Create a **YouTube Data API v3** key in the Google Cloud Console, enable the
   API for the project, and set `YOUTUBE_API_KEY`. Restrict the key to that API.
2. Set `YOUTUBE_IMPORT_CHANNEL_IDS` to the trusted channel ids (comma separated,
   each starts with `UC`), or replace the placeholders in
   `src/video-imports/video-imports.config.ts`. There is no channel database
   model or CRUD endpoint by design.
3. `YOUTUBE_IMPORT_MAX_VIDEOS_PER_CHANNEL` controls how many recent uploads are
   checked per channel (default `5`, maximum `50`). YouTube Shorts are filtered
   out: videos at or below `YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS` (default
   `180`, i.e. 3 minutes) are skipped, and `0` disables the filter.
4. AI suggestions are **on by default through Google Gemini's free tier**:
   create a free key at <https://aistudio.google.com/apikey> and set
   `AI_API_KEY`. No billing account is needed for the free tier. Without a key
   the import still runs and creates minimal drafts from the source
   title/description with no relations.

Required variables are listed in `.env.example`.

### AI provider (free by default)

`AI_PROVIDER` selects any OpenAI-compatible chat completions provider:

| `AI_PROVIDER`      | Default model              | API key                                      | Notes                            |
| ------------------ | -------------------------- | -------------------------------------------- | -------------------------------- |
| `gemini` (default) | `gemini-flash-lite-latest` | Free at <https://aistudio.google.com/apikey> | Free tier, high daily quota      |
| `groq`             | `openai/gpt-oss-120b`      | Free at <https://console.groq.com/keys>      | Very fast free tier              |
| `ollama`           | `llama3.2`                 | Not required                                 | Local, no account                |
| `openai`           | `gpt-4o-mini`              | Required                                     | Kept for compatibility           |
| `custom`           | —                          | Depends on the endpoint                      | Set `AI_BASE_URL` and `AI_MODEL` |

Any local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) works without
a key; any non-local base URL requires `AI_API_KEY`. Override a preset with
`AI_BASE_URL` and `AI_MODEL`.

Free tiers are rate limited, and each model has its own quota: the Gemini
`flash-lite` default allows many requests per day, while `gemini-3.8-flash` is
capped at roughly 20 per day. A `429` never fails the import: the draft is still
created from the source metadata with empty relationships and the reason is
returned in `summary.warnings`.

Free-tier data-use terms differ between providers. If metadata must not leave
your machine, use `AI_PROVIDER=ollama`; otherwise review the provider's policy.

### Endpoint

```bash
curl -X POST http://localhost:3000/api/v1/admin/video-imports/run \
  -H "Authorization: Bearer <admin access token>"
```

It returns `200` with `{ channels, videosPerChannel, shortsMaxDurationSeconds,
aiEnabled, discovered, imported, skipped, skippedShorts, failed, durationMs,
errors, warnings }`. A run already in progress returns `409`; a missing
`YOUTUBE_API_KEY` returns `503`; non-admins get `401`/`403`.

### Behaviour

- Uses the official, documented YouTube Data API v3 only (`channels.list`,
  `playlistItems.list`, `videos.list`) with an API key: public metadata,
  read-only. No scraping, no captions, no video/audio download or re-upload.
- One run at a time per process, processed sequentially. There is no cron, queue
  or worker; only the admin POST triggers it.
- Existing `youtubeVideoId`s are skipped before anything is created; the unique
  index on `video.youtubeVideoId` is the final guard.
- YouTube Shorts are skipped by duration. The Data API exposes no Shorts flag,
  so videos at or below `YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS` (default
  `180`) are treated as Shorts, counted in `skippedShorts`, and listed as
  warnings. This can also exclude a regular video that is under 3 minutes; set
  the variable to `0` to disable the filter.
- Suggested category/tag/speaker ids are verified against the active catalog and
  capped (3 categories, 5 tags, 2 speakers). No categories, tags or speakers are
  ever created.
- An AI error only produces a warning and falls back to the source metadata; it
  never fails the whole run.
- Drafts use `status: draft`, `publishedAt: null` and the calling admin's id as
  `createdBy`. Review and publish them through the existing video endpoints.

### YouTube policy notes

Using the documented Data API keeps the importer inside the YouTube API Services
Terms (undocumented clients and scraping are prohibited). Two follow-ups matter:

- Public metadata stored without user authorization is subject to the 30-day
  refresh-or-delete rule in the YouTube API Services Developer Policies
  (section III.E.4). Treat imported drafts as review material and replace or
  refresh the source metadata before relying on it long-term.
- If YouTube metadata or videos are shown to end users, follow YouTube's
  attribution/branding and playback requirements.

The pre-existing manual `POST /videos` flow uses `youtubei.js`, an undocumented
YouTube client. Phase 1 does not change that flow, but it is worth migrating
separately for the same policy reason.

### Tests

```bash
yarn test src/video-imports src/videos
```

The importer tests mock YouTube, AI and Mongo, so they need no credentials and
make no network calls.

## Playlist importer

Imports one public YouTube playlist as an app playlist. It reuses the same
YouTube key, AI settings and Shorts cutoff as the channel importer above.

```bash
curl -X POST http://localhost:3000/api/v1/admin/playlist-imports/run \
  -H "Authorization: Bearer <admin access token>" \
  -H "Content-Type: application/json" \
  -d '{
    "playlist": "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "speakers": ["<optional speaker id>"],
    "maxVideos": 50
  }'
```

`playlist` accepts a playlist URL or a bare playlist id. `title` and
`description` are optional overrides. `speakers` (max 5) are credited on every
newly imported video and on the playlist itself; the AI can still add up to two
more speakers per video. `maxVideos` defaults to `50` and is capped at `200`.

The response includes the app playlist id, whether it was created or updated,
and the usual import counters:

```json
{
  "appPlaylistId": "6ae005762190461f797ee342",
  "youtubePlaylistId": "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "created": true,
  "imported": 12,
  "skippedExisting": 3,
  "skippedShorts": 2,
  "playlistVideos": 15,
  "errors": [],
  "warnings": []
}
```

### Behaviour

- Uses `playlists.list`, `playlistItems.list` and `videos.list` (official Data
  API v3, read-only). One run is processed at a time per process.
- New videos go through `VideosService.createDraft`, so they are **drafts**.
  Categories/tags/speakers come from `AiMetadataService` and are validated
  against the active catalog; an AI failure only adds a warning.
- Videos already in the app are not re-created, but they are placed in the
  playlist in the same order as YouTube. Archived app videos are left out.
- Imported playlists may contain drafts until the admin publishes them; the
  playlist exists immediately so it can be reviewed. Manual playlists still
  require published videos.
- Re-importing the same YouTube playlist updates that playlist instead of
  creating a duplicate. New YouTube items are appended in playlist order and
  removed YouTube items disappear from the app playlist.
- Retrieve it with `GET /api/v1/playlists/:id`, or list the playlists that
  include a speaker with `GET /api/v1/playlists?speaker=<speaker id>`.
- A run already in progress returns `409`; a missing `YOUTUBE_API_KEY` returns
  `503`; a private/missing playlist returns `400`; non-admins get `401`/`403`.

### Tests

```bash
yarn test src/video-imports src/videos src/playlist-imports src/playlists
```

## Speaker video count

Every speaker document has a server-controlled `publishedVideosCount`: the
number of videos they are credited on that currently have `status: published`.

It is maintained automatically by the video endpoints:

| Action                                                     | Counter         |
| ---------------------------------------------------------- | --------------- |
| `PATCH /videos/:id/publish` on a draft/archived            | `+1`            |
| `PATCH /videos/:id/archive` on a published video           | `-1`            |
| `DELETE /videos/:id` on a published video                  | `-1`            |
| `PATCH /videos/:id` changing speakers of a published video | `±1` per change |

Repeating the same transition (publishing an already published video, archiving
a draft) never changes the counter, and it can never go below zero. Run the
backfill script if counters must be repaired:

```bash
npx ts-node scripts/backfill-speaker-published-counts.ts
```

It recomputes the field for every speaker from the videos collection and is safe
to re-run.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
