// Run with: playwright-cli run-code --filename=scripts/check-repository-composer.js
async page => {
  const writes = []
  const repository = { id: 1, owner: 'creator', name: 'game', full_name: 'creator/game', html_url: 'https://github.com/creator/game', can_remix: true, can_deploy: true, deployment_status: 'not_deployed' }
  const own = { ...repository, id: 2, owner: 'player', full_name: 'player/game', can_write: true, deployment_status: 'published', deployment_path: '/player/game' }
  await page.route('**/api/**', async route => {
    const path = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    let json = {}
    if (path === '/api/me') json = { user: { login: 'player' } }
    else if (path === '/api/repositories') json = { repositories: [own] }
    else if (path.startsWith('/api/profiles/')) json = { profile: { login: 'creator' }, repositories: [repository, own], projects: [] }
    else if (route.request().method() === 'POST') {
      writes.push({ path, body: route.request().postDataJSON() })
      json = { omgithub_path: path.endsWith('/deploy') ? '/creator/game' : '/player/game/issues/42' }
    } else if (path.endsWith('/progress')) json = { state: 'building' }
    else if (path.includes('/issues/')) json = { title: 'Test generation', screenshots: [], status: 'in progress' }
    else json = { projects: [] }
    await route.fulfill({ json })
  })
  await page.goto('http://127.0.0.1:5193/creator')
  await page.getByRole('button', { name: 'Remix', exact: true }).first().click()
  if (await page.getByRole('combobox').inputValue() !== 'creator/game') throw new Error('Remix did not select repository')
  if (writes.length) throw new Error('Remix submitted too early')
  await page.getByRole('textbox', { name: 'Generation request' }).fill('Add a cooperative game mode')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForURL('**/player/game/issues/42')
  if (writes[0].body.repository.owner !== 'creator') throw new Error('Wrong selected repository')
  await page.goto('http://127.0.0.1:5193/')
  await page.getByRole('textbox', { name: 'Generation request' }).fill('Create a maze game')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForURL('**/player/game/issues/42')
  if (writes[1].body.repository !== undefined) throw new Error('Playground must omit selection')
  await page.goto('http://127.0.0.1:5193/creator')
  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  await page.waitForURL('**/creator/game')
  if (writes[2].path !== '/api/repositories/creator/game/deploy') throw new Error('Wrong deployment endpoint')
  await page.goto('http://127.0.0.1:5193/creator')
  await page.getByRole('link', { name: 'Open', exact: true }).click()
  await page.waitForURL('**/player/game')
  if (writes.length !== 3) throw new Error('Open started a write')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5193/creator')
  await page.getByRole('button', { name: 'Remix', exact: true }).first().waitFor()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile horizontal overflow')
  return { passed: ['Remix selection without submission', 'selected generation', 'Playground generation', 'Deploy progress navigation', 'Open without write', 'mobile layout'] }
}
