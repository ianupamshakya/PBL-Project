export async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new Error('Unable to reach the server. Make sure MongoDB and the API are running.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}
