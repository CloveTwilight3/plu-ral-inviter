import { GuildMember, PartialGuildMember, EmbedBuilder } from 'discord.js';
import { database } from '../database/database.js';

export async function handleMemberLeave(member: GuildMember | PartialGuildMember) {
  try {
    // If it's a partial member, try to fetch the full member data
    const fullMember = member.partial ? await member.fetch().catch(() => null) : member;
    
    if (!fullMember) {
      console.log('Could not fetch full member data for leave event');
      return;
    }

    console.log(`Member left: ${fullMember.user.username} (${fullMember.id})`);
    
    // Get all proxies associated with this user
    const userProxies = await database.getUserProxies(fullMember.id);
    
    if (userProxies.length === 0) {
      console.log(`No proxies found for user ${fullMember.id}`);
      return;
    }

    console.log(`Found ${userProxies.length} proxies for user ${fullMember.id}`);
    
    const removedProxies: string[] = [];
    const failedRemovals: string[] = [];

    // Remove each proxy from the server
    for (const proxy of userProxies) {
      try {
        const proxyMember = fullMember.guild.members.cache.get(proxy.proxy_id);
        
        if (proxyMember) {
          await proxyMember.kick(`Associated user ${fullMember.user.username} left the server`);
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
    await database.removeUserProxies(fullMember.id);
    console.log(`Cleaned up database entries for user ${fullMember.id}`);

    // Log to mod channel if configured
    const modChannelId = await database.getModChannel(fullMember.guild.id);
    if (modChannelId) {
      const modChannel = fullMember.guild.channels.cache.get(modChannelId);
      
      if (modChannel && 'send' in modChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🚪 User Left - Proxies Removed')
          .setColor(0xED4245)
          .addFields(
            { name: 'User', value: `${fullMember.user.username} (${fullMember.id})`, inline: true },
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