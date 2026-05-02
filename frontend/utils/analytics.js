import getEnvVars from '../config';

const { apiUrl } = getEnvVars();

export async function logAppEvent({
    token,
    eventCategory,
    eventAction,
    actorType,
    actorId,
    sessionId,
    eventData = {},
}) {

    console.log("📊 ANALYTICS CHECK:", { actorType, sessionId, actorId });

    if (!token || !eventCategory || !eventAction || !actorId) {
        return;
    }

    try {
        await fetch(`${apiUrl}/api/v1/analytics/log_event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                event_category: eventCategory,
                event_action: eventAction,
                actor_type: actorType,
                actor_id: actorId,
                session_id: sessionId,
                event_data: eventData,
            }),
        });
    } catch (_) {
        // Silent failure by design: analytics should never block UX.
    }
}
