/**
 * test 组命令：test / evaluate
 * 移植自 drpy-node-mcp/tools/spiderTestTools.js，去掉 MCP content[] 包装。
 *
 * - test <source> <home|category|detail|search|play> [--class-id --ids --keyword --play-url --flag --ext]
 * - evaluate <source> [--class-id --keyword --timeout]
 *
 * 经 runtime.engine() 加载 drpy-node-bundle 的 localDsCore，调用 globalThis.getEngine。
 * rootDir 由 pathResolver 注入（替代原 spiderTestTools 硬编码的 PROJECT_ROOT）。
 */
import * as runtime from '../lib/runtime.js';

function truncateData(data, maxLen = 3000) {
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '\n... (数据已截断，共 ' + str.length + ' 字符)';
}

function buildTestResult(interfaceName, success, data, error, duration) {
  const result = { interface: interfaceName, success, duration_ms: duration };
  if (data !== undefined) {
    result.data_preview = truncateData(data);
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.list)) result.item_count = data.list.length;
      else if (Array.isArray(data)) result.item_count = data.length;
      if (Array.isArray(data.class)) result.class_count = data.class.length;
    }
  }
  if (error) result.error = error;
  return result;
}

async function callEngine(sourceName, query) {
  const engine = await runtime.engine();
  return engine(sourceName, query);
}

async function testHome(sourceName) {
  const start = performance.now();
  try {
    const data = await callEngine(sourceName, {});
    const duration = Math.round(performance.now() - start);
    const hasClasses = data && Array.isArray(data.class) && data.class.length > 0;
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!(hasClasses || hasList);
    return buildTestResult('首页(home)', success, data, success ? undefined : '返回数据中无有效分类或推荐列表', duration);
  } catch (e) {
    return buildTestResult('首页(home)', false, undefined, e.message, Math.round(performance.now() - start));
  }
}

async function testCategory(sourceName, classId, ext) {
  const start = performance.now();
  try {
    const query = { ac: 'list', t: classId };
    if (ext) query.ext = ext;
    const data = await callEngine(sourceName, query);
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    return {
      ...buildTestResult('一级(category)', success, data, success ? undefined : '分类列表为空', duration),
      class_id: classId,
      first_item: hasList ? truncateData(data.list[0], 500) : undefined,
    };
  } catch (e) {
    return { ...buildTestResult('一级(category)', false, undefined, e.message, Math.round(performance.now() - start)), class_id: classId };
  }
}

async function testDetail(sourceName, ids) {
  const start = performance.now();
  const idsArray = Array.isArray(ids) ? ids : typeof ids === 'string' && ids.includes(',') ? ids.split(',') : [String(ids)];
  try {
    const data = await callEngine(sourceName, { ac: 'detail', ids: idsArray });
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    let detail;
    if (hasList) {
      const item = data.list[0];
      detail = {
        vod_name: item.vod_name || item.title,
        vod_play_from: item.vod_play_from,
        vod_play_url_count: item.vod_play_url ? item.vod_play_url.split('#').length : 0,
      };
    }
    return {
      ...buildTestResult('二级(detail)', success, data, success ? undefined : '详情数据为空', duration),
      test_ids: ids,
      detail_preview: detail,
    };
  } catch (e) {
    return { ...buildTestResult('二级(detail)', false, undefined, e.message, Math.round(performance.now() - start)), test_ids: ids };
  }
}

async function testSearch(sourceName, keyword) {
  const start = performance.now();
  try {
    const data = await callEngine(sourceName, { wd: keyword });
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    return { ...buildTestResult('搜索(search)', success, data, success ? undefined : '搜索结果为空', duration), keyword };
  } catch (e) {
    return { ...buildTestResult('搜索(search)', false, undefined, e.message, Math.round(performance.now() - start)), keyword };
  }
}

async function testPlay(sourceName, playUrl, flag) {
  const start = performance.now();
  try {
    const query = { play: playUrl };
    if (flag) query.flag = flag;
    const data = await callEngine(sourceName, query);
    const duration = Math.round(performance.now() - start);
    const hasUrl = data && data.url && typeof data.url === 'string' && data.url.length > 0;
    const success = !!hasUrl;
    return {
      ...buildTestResult('播放(play)', success, data, success ? undefined : '未返回有效播放地址', duration),
      play_url_preview: hasUrl ? data.url.substring(0, 200) : undefined,
    };
  } catch (e) {
    return { ...buildTestResult('播放(play)', false, undefined, e.message, Math.round(performance.now() - start)) };
  }
}

/** test <source> <home|category|detail|search|play> */
async function test(ctx) {
  const sourceName = ctx.positional[0];
  const iface = ctx.positional[1];
  if (!sourceName || !iface) throw new Error('用法: test <source> <home|category|detail|search|play> [...]');

  switch (iface) {
    case 'home':
      return await testHome(sourceName);
    case 'category':
      return await testCategory(sourceName, ctx.flags['class-id'] || '1', ctx.flags.ext);
    case 'detail': {
      if (!ctx.flags.ids) throw new Error('二级测试需要 --ids（可通过先测一级获取 vod_id）');
      return await testDetail(sourceName, ctx.flags.ids);
    }
    case 'search':
      return await testSearch(sourceName, ctx.flags.keyword || '斗罗大陆');
    case 'play': {
      if (!ctx.flags['play-url']) throw new Error('播放测试需要 --play-url');
      return await testPlay(sourceName, ctx.flags['play-url'], ctx.flags.flag);
    }
    default:
      throw new Error(`未知接口: ${iface}，支持: home, category, detail, search, play`);
  }
}

/** evaluate <source> [--class-id --keyword --timeout] */
async function evaluate(ctx) {
  const sourceName = ctx.positional[0];
  if (!sourceName) throw new Error('source 必填');
  const classId = ctx.flags['class-id'] || null;
  const effectiveKeyword = ctx.flags.keyword === undefined ? '斗罗大陆' : ctx.flags.keyword;

  const overallStart = performance.now();
  const results = {
    source_name: sourceName,
    total_duration_ms: 0,
    interfaces: {},
    evaluation: { valid: false, score: 0, details: [] },
  };

  let firstCategoryId = classId;
  let firstItemIds = null;
  let firstPlayUrl = null;
  let firstPlayFlag = null;

  // Step 1: Home
  let homeData = null;
  try { homeData = await callEngine(sourceName, {}); } catch (_) {}
  const homeResult = buildTestResult('首页(home)', !!(homeData && (Array.isArray(homeData.class) || Array.isArray(homeData.list))), homeData, undefined, Math.round(performance.now() - overallStart));
  if (!homeResult.success && homeData) homeResult.error = '返回数据中无有效分类或推荐列表';
  results.interfaces.home = homeResult;
  results.evaluation.details.push(homeResult.success ? '✅ 首页: 正常' : `❌ 首页: ${homeResult.error || '无数据'}`);

  if (!firstCategoryId && homeData && Array.isArray(homeData.class) && homeData.class.length > 0) {
    firstCategoryId = homeData.class[0].type_id || homeData.class[0].id || String(homeData.class[0]);
  }

  // Step 2: Category
  if (firstCategoryId) {
    const catStart = performance.now();
    let catData = null;
    try { catData = await callEngine(sourceName, { ac: 'list', t: firstCategoryId }); } catch (_) {}
    const hasList = catData && Array.isArray(catData.list) && catData.list.length > 0;
    const catResult = { ...buildTestResult('一级(category)', !!hasList, catData, hasList ? undefined : '分类列表为空', Math.round(performance.now() - catStart)), class_id: firstCategoryId, first_item: hasList ? truncateData(catData.list[0], 500) : undefined };
    results.interfaces.category = catResult;
    if (catResult.success) {
      results.evaluation.details.push(`✅ 一级: 正常 (分类ID: ${firstCategoryId}, ${catResult.item_count}条)`);
      if (hasList) {
        const firstItem = catData.list[0];
        firstItemIds = firstItem.vod_id || firstItem.id || firstItem.url;
      }
    } else {
      results.evaluation.details.push(`❌ 一级: ${catResult.error || '无数据'} (分类ID: ${firstCategoryId})`);
    }
  } else {
    results.interfaces.category = { interface: '一级(category)', success: false, error: '无可用分类ID，跳过', skipped: true };
    results.evaluation.details.push('⏭️ 一级: 跳过 (无分类ID)');
  }

  // Step 3: Detail
  if (firstItemIds) {
    const detailIdsArray = Array.isArray(firstItemIds) ? firstItemIds : [String(firstItemIds)];
    const detailStart = performance.now();
    let detailData = null;
    try { detailData = await callEngine(sourceName, { ac: 'detail', ids: detailIdsArray }); } catch (_) {}
    const hasDetailList = detailData && Array.isArray(detailData.list) && detailData.list.length > 0;
    const detailResult = { ...buildTestResult('二级(detail)', !!hasDetailList, detailData, hasDetailList ? undefined : '详情数据为空', Math.round(performance.now() - detailStart)), test_ids: firstItemIds };
    if (hasDetailList) {
      const item = detailData.list[0];
      detailResult.detail_preview = { vod_name: item.vod_name || item.title, vod_play_from: item.vod_play_from, vod_play_url_count: item.vod_play_url ? item.vod_play_url.split('#').length : 0 };
    }
    results.interfaces.detail = detailResult;
    if (detailResult.success) {
      results.evaluation.details.push(`✅ 二级: 正常 (ID: ${firstItemIds})`);
      if (hasDetailList) {
        const item = detailData.list[0];
        if (item.vod_play_url) {
          const urls = item.vod_play_url.split('#');
          if (urls.length > 0 && urls[0]) {
            const parts = urls[0].split('$');
            firstPlayUrl = parts.length > 1 ? parts[1] : parts[0];
          }
        }
        if (item.vod_play_from) {
          const froms = item.vod_play_from.split('$$$');
          if (froms.length > 0) firstPlayFlag = froms[0] || undefined;
        }
      }
    } else {
      results.evaluation.details.push(`❌ 二级: ${detailResult.error || '无数据'} (ID: ${firstItemIds})`);
    }
  } else {
    results.interfaces.detail = { interface: '二级(detail)', success: false, error: '无可用影片ID，跳过', skipped: true };
    results.evaluation.details.push('⏭️ 二级: 跳过 (无影片ID)');
  }

  // Step 4: Search
  if (effectiveKeyword !== '') {
    const searchResult = await testSearch(sourceName, effectiveKeyword);
    results.interfaces.search = searchResult;
    results.evaluation.details.push(searchResult.success ? `✅ 搜索: 正常 (关键词: ${effectiveKeyword}, ${searchResult.item_count}条)` : `❌ 搜索: ${searchResult.error || '无数据'} (关键词: ${effectiveKeyword})`);
  }

  // Step 5: Play
  if (firstPlayUrl) {
    const playResult = await testPlay(sourceName, firstPlayUrl, firstPlayFlag);
    results.interfaces.play = playResult;
    results.evaluation.details.push(playResult.success ? '✅ 播放: 正常 (返回有效播放地址)' : `❌ 播放: ${playResult.error || '无有效地址'}`);
  } else {
    results.interfaces.play = { interface: '播放(play)', success: false, error: '无可用播放URL，跳过', skipped: true };
    results.evaluation.details.push('⏭️ 播放: 跳过 (无播放URL)');
  }

  // Score
  const catOk = results.interfaces.category && results.interfaces.category.success;
  const detailOk = results.interfaces.detail && results.interfaces.detail.success;
  const playOk = results.interfaces.play && results.interfaces.play.success;
  const homeOk = results.interfaces.home && results.interfaces.home.success;
  const searchOk = results.interfaces.search && results.interfaces.search.success;
  let score = 0;
  if (homeOk) score += 20;
  if (catOk) score += 20;
  if (detailOk) score += 25;
  if (playOk) score += 25;
  if (searchOk) score += 10;
  results.evaluation.score = score;
  results.evaluation.valid = !!(catOk && detailOk && playOk);
  results.total_duration_ms = Math.round(performance.now() - overallStart);
  return results;
}

export const commands = {
  test,
  evaluate,
};
