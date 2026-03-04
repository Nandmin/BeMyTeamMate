import { ALLOWED_METHODS } from './worker/constants.js';
import { corsHeaders, jsonResponse } from './worker/http.js';
import { handleContactMessage } from './worker/handlers/contact.js';
import { handleCspReport } from './worker/handlers/csp.js';
import { handleFinalizeMatchResults } from './worker/handlers/match.js';
import {
  handleMvpCronGetEvent,
  handleMvpCronListEvents,
  handleMvpCronListGroup,
  handleMvpCronNormalizeGroup,
  handleMvpCronReportGroup,
  handleMvpCronRunGroup,
  handleMvpCronRunNow,
  handleMvpGroupFinalize,
  handleMvpScheduled,
} from './worker/handlers/mvp.js';
import { handleSendNotification } from './worker/handlers/notifications.js';
import { handleIssuePushChallenge, handleRegisterPushToken } from './worker/handlers/push-token.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse(request, env, { error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/send-notification') {
      return handleSendNotification(request, env, ctx);
    }

    if (url.pathname === '/finalize-match-results') {
      return handleFinalizeMatchResults(request, env);
    }

    if (url.pathname === '/mvp-group-finalize') {
      return handleMvpGroupFinalize(request, env);
    }

    if (url.pathname === '/mvp-cron-run-now' || url.pathname === '/internal/mvp-cron/run-now') {
      return handleMvpCronRunNow(request, env, ctx);
    }

    if (url.pathname === '/mvp-cron-list-group' || url.pathname === '/internal/mvp-cron/list-group') {
      return handleMvpCronListGroup(request, env);
    }

    if (url.pathname === '/mvp-cron-run-group' || url.pathname === '/internal/mvp-cron/run-group') {
      return handleMvpCronRunGroup(request, env);
    }

    if (url.pathname === '/mvp-cron-get-event' || url.pathname === '/internal/mvp-cron/get-event') {
      return handleMvpCronGetEvent(request, env);
    }

    if (url.pathname === '/mvp-cron-list-events' || url.pathname === '/internal/mvp-cron/list-events') {
      return handleMvpCronListEvents(request, env);
    }

    if (url.pathname === '/mvp-cron-normalize-group' || url.pathname === '/internal/mvp-cron/normalize-group') {
      return handleMvpCronNormalizeGroup(request, env);
    }

    if (url.pathname === '/mvp-cron-report-group' || url.pathname === '/internal/mvp-cron/report-group') {
      return handleMvpCronReportGroup(request, env);
    }

    if (url.pathname === '/contact-message') {
      return handleContactMessage(request, env);
    }

    if (url.pathname === '/issue-push-challenge') {
      return handleIssuePushChallenge(request, env);
    }

    if (url.pathname === '/register-push-token') {
      return handleRegisterPushToken(request, env);
    }

    if (url.pathname === '/csp-report') {
      return handleCspReport(request);
    }

    return jsonResponse(request, env, { error: 'Endpoint not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    await handleMvpScheduled(event, env, ctx);
  },
};
