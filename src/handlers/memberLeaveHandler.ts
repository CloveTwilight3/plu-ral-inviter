import { GuildMember, EmbedBuilder } from 'discord.js';
import { database } from '../database/database.js';

export async function handleMemberLeave(member: GuildMember) {
  try {
    console.log(`Member left: ${member.user.username} (${member.id})`);
    
    // Get all proxies associated with this user
    const userProxies = await database.getUserProxies(member.id);
    
    if (userProxies.length === 0) {
      console.log(`No proxies found for user ${member.id}`);
      return;
    }

    console.log(`Found ${userProxies.length} proxies for user ${member.id}`);
    
    const removedProxies: string[] = [];
    const failedRemovals: string[] = [];

    // Remove each proxy from the server
    for (const proxy of userProxies) {
      try {
        const proxyMember = member.guild.members.cache.get(proxy.proxy_id);
        
        if (proxyMember) {
          await proxyMember.kick(`Associated user ${member.user.username} left the server`);
          removedProxies.push(`${proxyMember.user.username} (${proxy.proxy_id})`);
          console.log(`Removed proxy: ${proxyMember.user.username} (${proxy.proxy_id})`);
        } else {
          // Proxy not in server anymore, just clean up database
          console.log(`Proxy ${proxy.proxy_id} not found in server, cleaning up database entry`);
          removedProxies.push(`Unknown User (${proxy.proxy_id})`);
        }
      } catch (error) {
        console.error(`Failed to remove proxy ${proxy.proxy_id}:`, error);
        failedRemovals.push(proxy.proxy_id);
      }
    }

    // Clean up database entries
    await database.removeUserProxies(member.id);
    console.log(`Cleaned up database entries for user ${member.id}`);

    // Log to mod channel if configured
    const modChannelId = await database.getModChannel(member.guild.id);
    if (modChannelId) {
      const modChannel = member.guild.channels.cache.get(modChannelId);
      
      if (modChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('🚪 User Left - Proxies Removed')
          .setColor(0xED4245)
          .addFields(
            { name: 'User', value: `${member.user.username} (${member.id})`, inline: true },
            { name: 'Proxies Removed', value: removedProxies.length > 0 ? removedProxies.join('\n') : 'None', inline: false }
          )
          .setTimestamp();

        if (failedRemovals.length > 0) {
          embed.addFields({ 
            name: '⚠️ Failed Removals', 
            value: failedRemovals.join('\n'), 
            inline: false 
          });
        }

        try {
          await modChannel.send({ embeds: [embed] });
        } catch (error) {
          console.error('Failed to send mod channel notification:', error);
        }
      }
    }

  } catch (error) {
    console.error('Error handling member leave:', error);
  }
}