import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  @Get('videos')
  searchVideos(@Query() query: SearchQueryDto) {
    return this.searchService.searchVideos(query);
  }

  @Get('speakers')
  searchSpeakers(@Query() query: SearchQueryDto) {
    return this.searchService.searchSpeakers(query);
  }
}
