import { db } from '../config/database.js';

/**
 * 清理重复的刷新令牌
 * 对于每个用户，只保留最新的刷新令牌，撤销其余的
 */
async function cleanupDuplicateTokens(): Promise<void> {
  console.log('开始清理重复的刷新令牌...');
  
  try {
    // 查找所有有多个活跃令牌的用户
    const duplicateUsersResult = await db.query(`
      SELECT user_id, COUNT(*) as token_count
      FROM refresh_tokens 
      WHERE is_revoked = false 
      GROUP BY user_id 
      HAVING COUNT(*) > 1
    `);

    if (duplicateUsersResult.rows.length === 0) {
      console.log('没有发现重复的令牌');
      return;
    }

    console.log(`发现 ${duplicateUsersResult.rows.length} 个用户有重复的令牌`);

    for (const row of duplicateUsersResult.rows) {
      const userId = row.user_id;
      const tokenCount = row.token_count;
      
      console.log(`用户 ${userId} 有 ${tokenCount} 个活跃令牌，清理中...`);

      // 获取该用户的所有活跃令牌，按创建时间排序
      const userTokensResult = await db.query(`
        SELECT id, created_at 
        FROM refresh_tokens 
        WHERE user_id = $1 AND is_revoked = false 
        ORDER BY created_at DESC
      `, [userId]);

      // 保留最新的令牌，撤销其余的
      const tokensToRevoke = userTokensResult.rows.slice(1); // 跳过第一个（最新的）

      if (tokensToRevoke.length > 0) {
        const tokenIds = tokensToRevoke.map(t => t.id);
        await db.query(`
          UPDATE refresh_tokens 
          SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
          WHERE id = ANY($1)
        `, [tokenIds]);

        console.log(`为用户 ${userId} 撤销了 ${tokensToRevoke.length} 个旧令牌`);
      }
    }

    // 清理所有过期的令牌
    const expiredResult = await db.query(`
      UPDATE refresh_tokens 
      SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
      WHERE expires_at <= CURRENT_TIMESTAMP AND is_revoked = false
    `);

    console.log(`清理了 ${expiredResult.rowCount || 0} 个过期的令牌`);

    // 获取清理后的统计信息
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE is_revoked = false) as active_tokens,
        COUNT(DISTINCT user_id) FILTER (WHERE is_revoked = false) as users_with_active_tokens
      FROM refresh_tokens
    `);

    const stats = statsResult.rows[0];
    console.log('清理完成！');
    console.log(`总令牌数: ${stats.total_tokens}`);
    console.log(`活跃令牌数: ${stats.active_tokens}`);
    console.log(`有活跃令牌的用户数: ${stats.users_with_active_tokens}`);

  } catch (error) {
    console.error('清理过程中发生错误:', error);
    throw error;
  }
}

/**
 * 如果直接运行此脚本，则执行清理
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupDuplicateTokens()
    .then(() => {
      console.log('清理脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('清理脚本执行失败:', error);
      process.exit(1);
    });
}

export { cleanupDuplicateTokens }; 