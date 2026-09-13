// Run with: playwright-cli run-code --filename=scripts/check-repository-composer.js
async page => {
  const writes = []
  const repository = { id: 1, owner: 'creator', name: 'game', full_name: 'creator/game', html_url: 'https://github.com/creator/game', can_remix: true, can_deploy: true, deployment_status: 'not_deployed' }
  const own = { ...repository, id: 2, owner: 'player', full_name: 'player/game', can_write: true, deployment_status: 'published', deployment_path: '/player/game' }
  const published = { id: 'published', title: 'Published project', repo_owner: 'creator', repo: 'game', store_path: '/creator/game', status: 'published' }
  await page.unroute('**/api/**')
  await page.route('**/api/**', async route => {
    const path = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    let json = {}
    if (path === '/api/me') json = { user: { login: 'player' } }
    else if (path === '/api/repositories' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      writes.push({ path, body })
      if (body.name === 'game') return route.fulfill({ status: 422, json: { error: 'name already exists on this account' } })
      json = { repository: { ...own, id: 3, name: body.name, full_name: 'player/' + body.name, deployment_status: 'not_deployed', deployment_path: '' } }
    }
    else if (path === '/api/repositories') json = { repositories: [own] }
    else if (path.startsWith('/api/profiles/')) {
      const login = path.split('/').at(-1)
      json = { profile: { login }, repositories: [repository, own], projects: [published] }
    }
    else if (route.request().method() === 'POST') {
      writes.push({ path, body: route.request().postDataJSON() })
      json = { omgithub_path: path.endsWith('/deploy') ? '/creator/game' : '/player/game/issues/42' }
    } else if (path.endsWith('/progress')) json = { state: 'building' }
    else if (path.includes('/issues/')) json = { title: 'Test generation', screenshots: [], status: 'in progress' }
    else json = { projects: [published] }
    await route.fulfill({ json })
  })
  await page.goto('http://127.0.0.1:5193/creator')
  if (await page.getByRole('link', { name: 'Log out', exact: true }).count()) throw new Error('Logout appeared on another profile')
  if (await page.getByRole('textbox', { name: 'Generation request' }).count()) throw new Error('Profile still contains a composer')
  await page.getByRole('button', { name: 'Remix', exact: true }).first().click()
  await page.waitForURL('**/?remix=creator/game')
  if (await page.getByRole('combobox').inputValue() !== 'creator/game') throw new Error('Remix did not select repository')
  if (writes.length) throw new Error('Remix submitted too early')
  await page.getByRole('textbox', { name: 'Generation request' }).fill('Add a cooperative game mode')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForURL('**/player/game/issues/42')
  if (writes[0].body.repository.owner !== 'creator') throw new Error('Wrong selected repository')
  await page.goto('http://127.0.0.1:5193/')
  const playgroundTitle = await page.getByRole('combobox', { name: /^Repository/ }).getAttribute('title')
  if (!playgroundTitle?.includes('player/PlayGround')) throw new Error('Playground target is not available to assistive text')
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
  for (const selector of ['.repository-card', '.game-card', '.composer-repository']) {
    const color = await page.locator(selector).first().evaluate(el => getComputedStyle(el).backgroundColor)
    if (color === 'rgb(255, 255, 255)' || color === 'rgba(0, 0, 0, 0)') throw new Error('Missing dark surface: ' + selector)
  }
  const composerBox = await page.locator('.prompt-box').first().evaluate(el => ({ display: getComputedStyle(el).display, radius: parseFloat(getComputedStyle(el).borderRadius), width: el.getBoundingClientRect().width }))
  if (composerBox.display !== 'flex' || composerBox.radius < 18 || composerBox.width > 580) throw new Error('Composer is not a compact rounded panel')
  if (!await page.locator('.composer-toolbar .composer-repository').count()) throw new Error('Repository selector is outside composer toolbar')
  await page.getByRole('combobox').selectOption('__new_project__')
  const dialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.waitFor()
  if (!await page.getByRole('textbox', { name: 'Repository name', exact: true }).evaluate(el => el === document.activeElement)) throw new Error('Modal did not focus name')
  await page.getByRole('textbox', { name: 'Repository name', exact: true }).fill('draft')
  await page.keyboard.press('Shift+Tab')
  if (!await dialog.evaluate(el => el.contains(document.activeElement))) throw new Error('Focus escaped modal')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  if (!await page.getByRole('combobox').evaluate(el => el === document.activeElement)) throw new Error('Cancel did not restore focus')
  if (writes.length !== 3) throw new Error('Cancel created a repository')
  await page.getByRole('combobox').selectOption('__new_project__')
  await page.getByRole('textbox', { name: 'Repository name', exact: true }).fill('game')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'name already exists' }).waitFor()
  await page.getByRole('textbox', { name: 'Repository name', exact: true }).fill('new-game')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  if (await page.getByRole('combobox').inputValue() !== 'player/new-game') throw new Error('New Project was not selected')
  if (writes.length !== 5 || writes[4].path !== '/api/repositories') throw new Error('Project creation started generation')
  if (!await page.getByRole('textbox', { name: 'Generation request' }).evaluate(el => el === document.activeElement)) throw new Error('Creation did not focus composer')
  await page.getByRole('textbox', { name: 'Generation request' }).fill('Build a new racing game')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForURL('**/player/game/issues/42')
  if (writes[5].body.repository.repo !== 'new-game') throw new Error('Generation did not use the new repository')
  await page.goto('http://127.0.0.1:5193/')
  await page.getByRole('combobox', { name: /^Repository/ }).selectOption('player/game')
  await page.getByRole('combobox', { name: /^Repository/ }).selectOption('__new_project__')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await page.getByRole('combobox', { name: /^Repository/ }).inputValue() !== 'player/game') throw new Error('Cancel changed previous selection')
  await page.locator('.game-card').getByRole('button', { name: 'Remix', exact: true }).click()
  if (await page.getByRole('combobox', { name: /^Repository/ }).inputValue() !== 'creator/game') throw new Error('Published home project Remix did not select source')
  await page.goto('http://127.0.0.1:5193/?remix=creator/game')
  await page.waitForFunction(() => document.querySelector('.composer-repository select')?.value === 'creator/game')
  await page.getByRole('combobox', { name: /^Repository/ }).selectOption('__new_project__')
  await dialog.waitFor()
  if (await dialog.evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)') throw new Error('Light modal surface')
  await page.screenshot({ path: '/tmp/omgithub-dark-mobile.png' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5193/creator')
  await page.locator('.repository-card').first().waitFor()
  await page.screenshot({ path: '/tmp/omgithub-dark-desktop.png', fullPage: true })
  await page.goto('http://127.0.0.1:5193/player')
  const logout = page.getByRole('link', { name: 'Log out', exact: true })
  await logout.waitFor()
  if (await logout.getAttribute('href') !== '/?exec=logout') throw new Error('Wrong logout destination')
  if (await logout.evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)') throw new Error('Light logout button')
  await page.setViewportSize({ width: 390, height: 844 })
  await logout.waitFor()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Logout caused mobile overflow')
  return { passed: ['published profile Remix', 'selected generation', 'user Playground default', 'Deploy progress navigation', 'Open without write', 'mobile dark surfaces', 'modal focus and Escape', 'duplicate-name error', 'new project selection without generation', 'generation in new project', 'home modal cancellation', 'published home Remix', 'published-page remix link selection', 'dark modal and desktop screenshots', 'own-profile logout only', 'dark mobile logout'] }
}
